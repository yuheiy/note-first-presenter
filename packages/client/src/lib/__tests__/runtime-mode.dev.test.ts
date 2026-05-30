import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

beforeAll(() => {
  vi.stubGlobal('__NFP_STATIC__', false);
});

describe('runtime-mode (dev)', () => {
  it('returns api URLs in dev mode', async () => {
    const { metaUrl, dbUrl, slideUrl, isStatic } = await import('../runtime-mode');
    expect(isStatic).toBe(false);
    expect(metaUrl()).toBe('/api/slides/meta');
    expect(dbUrl()).toBe('/api/db');
    expect(slideUrl('abc', 1)).toBe('/api/slide/abc/1');
  });
});
