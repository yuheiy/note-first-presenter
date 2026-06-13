import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RenderAllResult, RenderedSlide, Slides } from '../slides.ts';

const TARGET_SCALE = 2.0;
const WEBP_QUALITY = 85;
const RENDER_CONCURRENCY = 4;

export class PageOutOfRangeError extends Error {
  readonly page: number;
  readonly pageCount: number;

  constructor(page: number, pageCount: number) {
    super(`page ${page} out of range (1..${pageCount})`);
    this.page = page;
    this.pageCount = pageCount;
  }
}

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;
type RenderParameters = Parameters<PdfPage['render']>[0];

interface LoadedPdf {
  hash: string;
  pdf: PdfDocument;
  pageCount: number;
}

function slideFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(4, '0')}.webp`;
}

function slideCachePath(cacheRoot: string, hash: string, pageNumber: number): string {
  return path.join(cacheRoot, 'slides', hash, slideFilename(pageNumber));
}

async function pruneOtherHashes(cacheRoot: string, currentHash: string): Promise<void> {
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

async function loadAndHash(slidesPath: string, cacheRoot: string): Promise<LoadedPdf> {
  const bytes = await fs.readFile(slidesPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await pruneOtherHashes(cacheRoot, hash);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  return { hash, pdf, pageCount: pdf.numPages };
}

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

export function openPdfSlides(slidesPath: string, opts?: { cacheRoot?: string }): Slides {
  const cacheRoot = opts?.cacheRoot ?? path.resolve('node_modules', '.note-first-presenter');
  let pdfP: Promise<LoadedPdf> | null = null;
  const getPdf = () => (pdfP ??= loadAndHash(slidesPath, cacheRoot));

  return {
    async meta() {
      const { hash, pageCount } = await getPdf();
      return { hash, pageCount };
    },
    async image(pageNumber) {
      const { hash, pdf, pageCount } = await getPdf();
      if (pageNumber < 1 || pageNumber > pageCount) {
        throw new PageOutOfRangeError(pageNumber, pageCount);
      }
      const cachePath = slideCachePath(cacheRoot, hash, pageNumber);
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
    },
    async size(pageNumber) {
      const { pdf, pageCount } = await getPdf();
      if (pageNumber < 1 || pageNumber > pageCount) {
        throw new PageOutOfRangeError(pageNumber, pageCount);
      }
      const page = await pdf.getPage(pageNumber);
      const vp = page.getViewport({ scale: TARGET_SCALE });
      return { width: Math.ceil(vp.width), height: Math.ceil(vp.height) };
    },
    async renderAll(outDir) {
      const { hash, pageCount } = await getPdf();
      await fs.mkdir(outDir, { recursive: true });
      const slides: RenderedSlide[] = Array.from<RenderedSlide>({ length: pageCount });
      let nextPage = 1;
      const worker = async (): Promise<void> => {
        while (true) {
          const n = nextPage++;
          if (n > pageCount) return;
          const { data } = await this.image(n);
          const { width, height } = await this.size(n);
          const name = slideFilename(n);
          await fs.writeFile(path.join(outDir, name), data);
          slides[n - 1] = { number: n, width, height, file: name };
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(RENDER_CONCURRENCY, pageCount) }, () => worker()),
      );
      return { hash, slides } satisfies RenderAllResult;
    },
    invalidate() {
      pdfP = null;
    },
  };
}
