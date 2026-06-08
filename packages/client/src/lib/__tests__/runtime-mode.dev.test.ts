import { describe, expect, it } from 'vite-plus/test';

describe('runtime-mode (dev)', () => {
  it('returns api URLs in dev mode', async () => {
    const { metaUrl, dbUrl, slideUrl } = await import('../runtime-mode');
    expect(metaUrl()).toBe('/api/slides/meta');
    expect(dbUrl()).toBe('/api/db');
    expect(slideUrl('abc', 1)).toBe('/api/slide/abc/1');
  });
});
