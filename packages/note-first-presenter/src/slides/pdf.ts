import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PageOutOfRangeError,
  type RenderAllResult,
  type RenderedSlide,
  slideFilename,
  type Slides,
} from './model.ts';

// Pages are rasterised at twice their nominal PDF size; `meta()` reports the
// scaled dimensions, so the client lays slides out at exactly the size the
// images carry.
const TARGET_SCALE = 2.0;
// Lossy webp quality handed to canvas.encode.
const WEBP_QUALITY = 85;
// Each in-flight page holds a full canvas bitmap, so this bounds peak render
// memory by a constant rather than by the deck's page count.
const RENDER_CONCURRENCY = 4;

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;
type RenderParameters = Parameters<PdfPage['render']>[0];

interface LoadedPdf {
  hash: string;
  pdf: PdfDocument;
  pageCount: number;
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

function scaledViewport(page: PdfPage): {
  viewport: ReturnType<PdfPage['getViewport']>;
  width: number;
  height: number;
} {
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  return { viewport, width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) };
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

export function openPdfSlides(slidesPath: string, opts: { cacheRoot: string }): Slides {
  const { cacheRoot } = opts;
  let pdfP: Promise<LoadedPdf> | null = null;
  const getPdf = () => {
    if (!pdfP) {
      const p = loadAndHash(slidesPath, cacheRoot);
      pdfP = p;
      // A rejected load must not be sticky: clear it so the next call retries.
      p.catch(() => {
        if (pdfP === p) pdfP = null;
      });
    }
    return pdfP;
  };

  return {
    async meta() {
      const { hash, pdf, pageCount } = await getPdf();
      const { width, height } = scaledViewport(await pdf.getPage(1));
      return { hash, pageCount, width, height };
    },
    async image(pageNumber) {
      const { hash, pdf, pageCount } = await getPdf();
      if (pageNumber < 1 || pageNumber > pageCount) {
        throw new PageOutOfRangeError(pageNumber, pageCount);
      }
      // pdfjs memoises getPage per document, so asking again for a cached
      // image costs a lookup, not a re-parse.
      const page = await pdf.getPage(pageNumber);
      const { viewport, width, height } = scaledViewport(page);
      const cachePath = slideCachePath(cacheRoot, hash, pageNumber);
      try {
        const data = await fs.readFile(cachePath);
        return { data, hash, pageCount, width, height };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      const data = await encodePage(page, viewport, width, height);
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, data);
      return { data, hash, pageCount, width, height };
    },
    async renderAll(outDir) {
      const { hash, pageCount } = await getPdf();
      await fs.mkdir(outDir, { recursive: true });
      const slides: RenderedSlide[] = [];
      for (let start = 1; start <= pageCount; start += RENDER_CONCURRENCY) {
        const batch = Array.from(
          { length: Math.min(RENDER_CONCURRENCY, pageCount - start + 1) },
          (_, i) => start + i,
        );
        slides.push(
          ...(await Promise.all(
            batch.map(async (n): Promise<RenderedSlide> => {
              const { data, width, height } = await this.image(n);
              const file = slideFilename(n);
              await fs.writeFile(path.join(outDir, file), data);
              return { number: n, width, height, file };
            }),
          )),
        );
      }
      return { hash, slides } satisfies RenderAllResult;
    },
    invalidate() {
      const p = pdfP;
      pdfP = null;
      // Release pdfjs worker/native memory; ignore failures (already-broken loads).
      void p?.then((loaded) => loaded.pdf.loadingTask.destroy()).catch(() => {});
    },
  };
}
