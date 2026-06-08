import { describe, expect, it, vi } from 'vite-plus/test';

describe('runtime-mode (build)', () => {
  it('returns static nfp-data URLs in build mode', async () => {
    vi.stubEnv('DEV', false);
    const { metaUrl, dbUrl, slideUrl } = await import('../runtime-mode');
    expect(metaUrl()).toBe('/nfp-data/meta.json');
    expect(dbUrl()).toBe('/nfp-data/db.json');
    expect(slideUrl('abc', 1)).toBe('/nfp-data/slides/abc/0001.webp');
    vi.unstubAllEnvs();
  });
});
