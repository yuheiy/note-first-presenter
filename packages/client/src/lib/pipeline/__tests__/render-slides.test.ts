import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { renderAllSlides } from '../render-slides';

const SAMPLE = path.resolve(import.meta.dirname, '../../server/__tests__/fixtures/sample.pdf');
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
