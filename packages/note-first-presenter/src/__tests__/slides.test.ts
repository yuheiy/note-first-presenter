import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_SLIDES_PATH, missingSlidesMeta, openSlides, resolveSlides } from '../slides.ts';
import { withTempCwd } from './helpers.ts';

const SAMPLE_PDF = path.resolve(import.meta.dirname, 'fixtures/sample.pdf');

withTempCwd('nfp-slides-');

describe('resolveSlides', () => {
  it('falls back to the default filename when the config says nothing', async () => {
    await fs.writeFile(DEFAULT_SLIDES_PATH, '%PDF-1.4');
    expect(resolveSlides(undefined)).toEqual({
      kind: 'resolved',
      path: path.resolve(DEFAULT_SLIDES_PATH),
    });
  });

  it('reports missing when the default filename is absent', () => {
    expect(resolveSlides(undefined)).toEqual({
      kind: 'missing',
      path: path.resolve(DEFAULT_SLIDES_PATH),
    });
  });

  // The point of the whole rule: a PDF sitting in the project is not a deck
  // unless it is the one the config names (docs/adr/0019).
  it('ignores another PDF in the cwd rather than adopting it', async () => {
    await fs.writeFile('deck.pdf', '%PDF-1.4');
    expect(resolveSlides(undefined)).toEqual({
      kind: 'missing',
      path: path.resolve(DEFAULT_SLIDES_PATH),
    });
  });

  it('resolves a configured path against the cwd', async () => {
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile('docs/main.pdf', '%PDF-1.4');
    expect(resolveSlides('./docs/main.pdf')).toEqual({
      kind: 'resolved',
      path: path.resolve('docs', 'main.pdf'),
    });
  });

  it('reports missing with the resolved path when the configured file is absent', () => {
    expect(resolveSlides('docs/main.pdf')).toEqual({
      kind: 'missing',
      path: path.resolve('docs', 'main.pdf'),
    });
  });
});

describe('missingSlidesMeta', () => {
  it('relativises the path so the browser never shows the author’s home directory', () => {
    const status = resolveSlides('docs/main.pdf');
    expect(missingSlidesMeta(status as Extract<typeof status, { kind: 'missing' }>)).toEqual({
      kind: 'missing',
      path: path.join('docs', 'main.pdf'),
    });
  });
});

describe('openSlides (PDF)', () => {
  it('renders the first page to webp and caches subsequent calls', async () => {
    const slides = openSlides(SAMPLE_PDF);

    const meta = await slides.meta();
    expect(meta.pageCount).toBeGreaterThan(0);
    expect(meta.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);

    const first = await slides.image(1);
    expect(first.data.byteLength).toBeGreaterThan(0);
    expect(first.hash).toBe(meta.hash);

    const second = await slides.image(1);
    expect(second.data.equals(first.data)).toBe(true);
  });

  it('throws PageOutOfRangeError when the page number is out of range', async () => {
    const slides = openSlides(SAMPLE_PDF);
    const meta = await slides.meta();
    await expect(slides.image(meta.pageCount + 1)).rejects.toThrow(/out of range/);
  });

  it('retries after a failed load instead of caching the rejection', async () => {
    await fs.writeFile('broken.pdf', 'not a pdf');
    const slides = openSlides(path.resolve('broken.pdf'));
    await expect(slides.meta()).rejects.toThrow();

    // Replace the broken file with a valid PDF; the same Slides instance
    // must retry rather than keep returning the cached rejection.
    await fs.copyFile(SAMPLE_PDF, 'broken.pdf');
    const meta = await slides.meta();
    expect(meta.pageCount).toBeGreaterThan(0);
  });

  it('invalidate() releases the loaded document and allows a fresh reload', async () => {
    const slides = openSlides(SAMPLE_PDF);
    const first = await slides.meta();

    slides.invalidate();

    // A second meta() after invalidate() must re-load successfully (not
    // throw from touching an already-destroyed pdfjs document) and produce
    // the same result.
    const second = await slides.meta();
    expect(second).toEqual(first);
  });
});

describe('Slides.renderAll', () => {
  it('writes one webp per page and reports meta', async () => {
    const outDir = path.resolve('images');
    const result = await openSlides(SAMPLE_PDF).renderAll(outDir);
    expect(result.slides.length).toBeGreaterThanOrEqual(1);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    const stat = await fs.stat(path.join(outDir, '0001.webp'));
    expect(stat.size).toBeGreaterThan(0);
    expect(result.slides[0].width).toBeGreaterThan(0);
    expect(result.slides[0].height).toBeGreaterThan(0);
    expect(result.slides[0].file).toBe('0001.webp');
  });

  it('returns slides in ascending page-number order', async () => {
    const outDir = path.resolve('images-order');
    const result = await openSlides(SAMPLE_PDF).renderAll(outDir);
    for (let i = 0; i < result.slides.length; i++) {
      const slide = result.slides[i];
      expect(slide.number).toBe(i + 1);
      expect(slide.file).toBe(`${String(i + 1).padStart(4, '0')}.webp`);
    }
  });

  it('returns identical result on second call (cache hit)', async () => {
    const outDir = path.resolve('images-cache');
    const slides = openSlides(SAMPLE_PDF);
    const first = await slides.renderAll(outDir);
    const second = await slides.renderAll(outDir);
    expect(second).toEqual(first);
  });
});
