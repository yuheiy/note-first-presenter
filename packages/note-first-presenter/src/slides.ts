import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { glob } from 'tinyglobby';

export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface ResolveSlidesArgs {
  cwd?: string;
  configuredSlides: string | undefined;
  configFile: string | null;
}

export async function resolveSlidesPath({
  cwd = process.cwd(),
  configuredSlides,
  configFile,
}: ResolveSlidesArgs): Promise<SlidesStatus> {
  if (configuredSlides) {
    const base = configFile ? path.dirname(configFile) : cwd;
    const abs = path.resolve(base, configuredSlides);
    return existsSync(abs)
      ? { kind: 'resolved', path: abs }
      : { kind: 'configured-but-missing', configuredPath: abs };
  }

  const pdfs = await glob('*.pdf', { cwd, absolute: true });
  if (pdfs.length === 0) return { kind: 'no-config-no-file' };
  if (pdfs.length === 1) return { kind: 'resolved', path: pdfs[0] };
  return { kind: 'no-config-multiple-files', candidates: pdfs };
}

export function slideFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(4, '0')}.webp`;
}

export function slideCachePath(cacheRoot: string, hash: string, pageNumber: number): string {
  return path.join(cacheRoot, 'slides', hash, slideFilename(pageNumber));
}

export async function pruneOtherHashes(cacheRoot: string, currentHash: string): Promise<void> {
  const slidesDir = path.join(cacheRoot, 'slides');
  let entries: string[];
  try {
    entries = await fs.readdir(slidesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  await Promise.all(
    entries
      .filter((name) => name !== currentHash)
      .map((name) => fs.rm(path.join(slidesDir, name), { recursive: true, force: true })),
  );
}

const TARGET_SCALE = 2.0;
const WEBP_QUALITY = 85;

export class PageOutOfRangeError extends Error {
  constructor(
    public readonly page: number,
    public readonly pageCount: number,
  ) {
    super(`page ${page} out of range (1..${pageCount})`);
  }
}

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

interface LoadedPdf {
  hash: string;
  pdf: PdfDocument;
  pageCount: number;
}

interface PdfState {
  slidesPath: string;
  cacheRoot: string;
  pdfP: Promise<LoadedPdf> | null;
}

let state: PdfState | null = null;

export interface PdfStateInput {
  slidesPath: string;
  cwd?: string;
}

export function resetPdfState({ slidesPath, cwd = process.cwd() }: PdfStateInput) {
  state = { slidesPath, cacheRoot: getCacheRoot(cwd), pdfP: null };
}

export function ensurePdfState({ slidesPath, cwd = process.cwd() }: PdfStateInput) {
  const cacheRoot = getCacheRoot(cwd);
  if (!state || state.slidesPath !== slidesPath || state.cacheRoot !== cacheRoot) {
    state = { slidesPath, cacheRoot, pdfP: null };
  }
}

export function invalidatePdf() {
  if (state) state.pdfP = null;
}

function ensureState(): PdfState {
  if (!state) throw new Error('PDF state not initialized');
  return state;
}

async function loadAndHash(s: PdfState): Promise<LoadedPdf> {
  const bytes = await fs.readFile(s.slidesPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await pruneOtherHashes(s.cacheRoot, hash);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  return { hash, pdf, pageCount: pdf.numPages };
}

function getPdf(): Promise<LoadedPdf> {
  const s = ensureState();
  s.pdfP ??= loadAndHash(s);
  return s.pdfP;
}

export async function getSlidesMeta(): Promise<{ hash: string; pageCount: number }> {
  const { hash, pageCount } = await getPdf();
  return { hash, pageCount };
}

export async function getSlideImage(
  pageNumber: number,
): Promise<{ data: Buffer; hash: string; pageCount: number }> {
  const s = ensureState();
  const { hash, pdf, pageCount } = await getPdf();
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new PageOutOfRangeError(pageNumber, pageCount);
  }
  const cachePath = slideCachePath(s.cacheRoot, hash, pageNumber);
  try {
    const data = await fs.readFile(cachePath);
    return { data, hash, pageCount };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const data = await encodePage(page, viewport, width, height);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return { data, hash, pageCount };
}

export async function getSlideSize(pageNumber: number): Promise<{ width: number; height: number }> {
  const { pdf, pageCount } = await getPdf();
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new PageOutOfRangeError(pageNumber, pageCount);
  }
  const page = await pdf.getPage(pageNumber);
  const vp = page.getViewport({ scale: TARGET_SCALE });
  return { width: Math.ceil(vp.width), height: Math.ceil(vp.height) };
}

type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;
type RenderParameters = Parameters<PdfPage['render']>[0];

async function encodePage(
  page: PdfPage,
  viewport: ReturnType<PdfPage['getViewport']>,
  width: number,
  height: number,
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  await page.render({
    canvas: canvas as unknown as RenderParameters['canvas'],
    canvasContext: ctx as unknown as RenderParameters['canvasContext'],
    viewport,
  }).promise;
  return canvas.encode('webp', WEBP_QUALITY);
}

export interface RenderedSlide {
  number: number;
  width: number;
  height: number;
  file: string;
}

export interface RenderAllResult {
  hash: string;
  pageCount: number;
  slides: RenderedSlide[];
}

export interface RenderAllOptions {
  slidesPath: string;
  cwd?: string;
  outDir: string;
}

export async function renderAllSlides({
  slidesPath,
  cwd = process.cwd(),
  outDir,
}: RenderAllOptions): Promise<RenderAllResult> {
  ensurePdfState({ slidesPath, cwd });
  const { hash, pageCount } = await getSlidesMeta();
  await fs.mkdir(outDir, { recursive: true });
  const slides: RenderedSlide[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const { data } = await getSlideImage(n);
    const { width, height } = await getSlideSize(n);
    const name = slideFilename(n);
    await fs.writeFile(path.join(outDir, name), data);
    slides.push({ number: n, width, height, file: name });
  }
  return { hash, pageCount, slides };
}

function getCacheRoot(cwd: string): string {
  return path.join(cwd, 'node_modules', '.note-first-presenter');
}
