import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pruneOtherHashes, slideCachePath } from './slide-cache';

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

export function resetPdfState(input: { slidesPath: string; cacheRoot: string }) {
  state = { slidesPath: input.slidesPath, cacheRoot: input.cacheRoot, pdfP: null };
}

export function ensurePdfState(input: { slidesPath: string; cacheRoot: string }) {
  if (!state || state.slidesPath !== input.slidesPath || state.cacheRoot !== input.cacheRoot) {
    resetPdfState(input);
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
  const data = await renderPage(pdf, pageNumber);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return { data, hash, pageCount };
}

async function renderPage(pdf: PdfDocument, pageNumber: number): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return canvas.encode('webp', WEBP_QUALITY);
}
