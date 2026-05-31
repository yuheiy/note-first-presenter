import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  cacheRootFor,
  getSlideImage,
  getSlidesMeta,
  pruneOtherHashes,
  renderAllSlides,
  resetPdfState,
  resolveSlidesPath,
  slideCachePath,
} from '../slides';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-slides-'));
}

describe('resolveSlidesPath', () => {
  it('returns no-config-no-file when nothing exists', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-no-file');
  });

  it('returns resolved when a single PDF exists', async () => {
    const cwd = await makeTmp();
    const pdf = path.join(cwd, 'slides.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });

  it('returns no-config-multiple-files when many', async () => {
    const cwd = await makeTmp();
    await fs.writeFile(path.join(cwd, 'a.pdf'), '%PDF-1.4');
    await fs.writeFile(path.join(cwd, 'b.pdf'), '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-multiple-files');
  });

  it('returns configured-but-missing when path does not exist', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './missing.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result.kind).toBe('configured-but-missing');
  });

  it('resolves configured path relative to config file directory', async () => {
    const cwd = await makeTmp();
    const sub = path.join(cwd, 'docs');
    await fs.mkdir(sub, { recursive: true });
    const pdf = path.join(sub, 'main.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './docs/main.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(__dirname, 'fixtures/sample.pdf');

describe('pdf-renderer', () => {
  it('renders the first page to webp and caches subsequent calls', async () => {
    const cacheRoot = await fs.mkdtemp(path.join(tmpdir(), 'nfp-cache-'));
    resetPdfState({ slidesPath: fixture, cacheRoot });

    const meta = await getSlidesMeta();
    expect(meta.pageCount).toBeGreaterThan(0);
    expect(meta.hash).toMatch(/^[0-9a-f]{64}$/);

    const first = await getSlideImage(1);
    expect(first.data.byteLength).toBeGreaterThan(0);
    expect(first.hash).toBe(meta.hash);

    const second = await getSlideImage(1);
    expect(second.data.equals(first.data)).toBe(true);
  });

  it('throws PageOutOfRangeError when the page number is out of range', async () => {
    const cacheRoot = await fs.mkdtemp(path.join(tmpdir(), 'nfp-cache-'));
    resetPdfState({ slidesPath: fixture, cacheRoot });
    const meta = await getSlidesMeta();
    await expect(getSlideImage(meta.pageCount + 1)).rejects.toThrow(/out of range/);
  });
});

async function makeCacheTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-slide-cache-'));
}

describe('slideCachePath', () => {
  it('produces zero-padded 4-digit filenames under hash dir', () => {
    const p = slideCachePath('/proj/node_modules/.note-first-presenter', 'abc123', 7);
    expect(p).toBe('/proj/node_modules/.note-first-presenter/slides/abc123/0007.webp');
  });

  it('pads to 4 digits even at 1000+', () => {
    const p = slideCachePath('/r', 'h', 1234);
    expect(p).toBe('/r/slides/h/1234.webp');
  });
});

describe('pruneOtherHashes', () => {
  it('removes hash dirs that do not match the current hash', async () => {
    const dir = await makeCacheTmp();
    const slidesDir = path.join(dir, 'slides');
    await fs.mkdir(path.join(slidesDir, 'old'), { recursive: true });
    await fs.mkdir(path.join(slidesDir, 'new'), { recursive: true });
    await pruneOtherHashes(dir, 'new');
    expect(existsSync(path.join(slidesDir, 'old'))).toBe(false);
    expect(existsSync(path.join(slidesDir, 'new'))).toBe(true);
  });

  it('is a no-op when cache root does not exist', async () => {
    const dir = await makeCacheTmp();
    await expect(pruneOtherHashes(dir, 'whatever')).resolves.toBeUndefined();
  });
});

const SAMPLE = path.resolve(__dirname, 'fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-render-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('renderAllSlides', () => {
  it('writes one webp per page and reports meta', async () => {
    const outDir = path.join(tmp, 'images');
    const cacheRoot = path.join(tmp, 'cache');
    const result = await renderAllSlides({ slidesPath: SAMPLE, cacheRoot, outDir });
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

describe('cacheRootFor', () => {
  it('returns <cwd>/node_modules/.note-first-presenter', () => {
    expect(cacheRootFor('/proj')).toBe('/proj/node_modules/.note-first-presenter');
  });
});
