import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { pruneOtherHashes, slideCachePath } from '../slide-cache';

async function makeTmp() {
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
    const dir = await makeTmp();
    const slidesDir = path.join(dir, 'slides');
    await fs.mkdir(path.join(slidesDir, 'old'), { recursive: true });
    await fs.mkdir(path.join(slidesDir, 'new'), { recursive: true });
    await pruneOtherHashes(dir, 'new');
    expect(existsSync(path.join(slidesDir, 'old'))).toBe(false);
    expect(existsSync(path.join(slidesDir, 'new'))).toBe(true);
  });

  it('is a no-op when cache root does not exist', async () => {
    const dir = await makeTmp();
    await expect(pruneOtherHashes(dir, 'whatever')).resolves.toBeUndefined();
  });
});
