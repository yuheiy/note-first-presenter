import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { getSlideImage, getSlidesMeta, resetPdfState } from '../pdf-renderer';

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
