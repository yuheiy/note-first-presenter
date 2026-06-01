import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { openSlides, resolveSlidesPath } from '../slides';
import { useTempCwd } from '../../test/_helpers/use-temp-cwd';

const fixture = path.resolve(import.meta.dirname, '../../test/__fixtures__/sample.pdf');

useTempCwd('nfp-slides-');

describe('resolveSlidesPath', () => {
  it('returns no-config-no-file when nothing exists', async () => {
    const result = await resolveSlidesPath({ configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-no-file');
  });

  it('returns resolved when a single PDF exists', async () => {
    await fs.writeFile('slides.pdf', '%PDF-1.4');
    const result = await resolveSlidesPath({ configuredSlides: undefined, configFile: null });
    expect(result).toEqual({ kind: 'resolved', path: path.resolve('slides.pdf') });
  });

  it('returns no-config-multiple-files when many', async () => {
    await fs.writeFile('a.pdf', '%PDF-1.4');
    await fs.writeFile('b.pdf', '%PDF-1.4');
    const result = await resolveSlidesPath({ configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-multiple-files');
  });

  it('returns configured-but-missing when path does not exist', async () => {
    const result = await resolveSlidesPath({
      configuredSlides: './missing.pdf',
      configFile: path.resolve('note-first-presenter.config.ts'),
    });
    expect(result.kind).toBe('configured-but-missing');
  });

  it('resolves configured path relative to config file directory', async () => {
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile('docs/main.pdf', '%PDF-1.4');
    const result = await resolveSlidesPath({
      configuredSlides: './docs/main.pdf',
      configFile: path.resolve('note-first-presenter.config.ts'),
    });
    expect(result).toEqual({ kind: 'resolved', path: path.resolve('docs', 'main.pdf') });
  });
});

describe('openSlides (PDF)', () => {
  it('renders the first page to webp and caches subsequent calls', async () => {
    const slides = openSlides(fixture);

    const meta = await slides.meta();
    expect(meta.pageCount).toBeGreaterThan(0);
    expect(meta.hash).toMatch(/^[0-9a-f]{64}$/);

    const first = await slides.image(1);
    expect(first.data.byteLength).toBeGreaterThan(0);
    expect(first.hash).toBe(meta.hash);

    const second = await slides.image(1);
    expect(second.data.equals(first.data)).toBe(true);
  });

  it('throws PageOutOfRangeError when the page number is out of range', async () => {
    const slides = openSlides(fixture);
    const meta = await slides.meta();
    await expect(slides.image(meta.pageCount + 1)).rejects.toThrow(/out of range/);
  });
});

describe('Slides.renderAll', () => {
  it('writes one webp per page and reports meta', async () => {
    const outDir = path.resolve('images');
    const result = await openSlides(fixture).renderAll(outDir);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.slides).toHaveLength(result.pageCount);
    const stat = await fs.stat(path.join(outDir, '0001.webp'));
    expect(stat.size).toBeGreaterThan(0);
    expect(result.slides[0].width).toBeGreaterThan(0);
    expect(result.slides[0].height).toBeGreaterThan(0);
    expect(result.slides[0].file).toBe('0001.webp');
  });
});
