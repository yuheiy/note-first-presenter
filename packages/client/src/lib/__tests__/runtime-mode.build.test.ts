import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('virtual:nfp/mode', () => ({ isStatic: true }));

describe('runtime-mode (build)', () => {
  it('returns static nfp-data URLs in build mode', async () => {
    const { metaUrl, dbUrl, slideUrl, isStatic } = await import('../runtime-mode');
    expect(isStatic).toBe(true);
    expect(metaUrl()).toBe('/nfp-data/meta.json');
    expect(dbUrl()).toBe('/nfp-data/db.json');
    expect(slideUrl('abc', 1)).toBe('/nfp-data/slides/abc/0001.webp');
  });
});
