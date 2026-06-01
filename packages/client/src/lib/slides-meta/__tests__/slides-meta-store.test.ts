import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

beforeAll(() => {
  vi.stubGlobal('__NFP_STATIC__', false);
});

const fetchMock = vi.fn();

vi.mock('$lib/server-client', () => ({
  api: (...args: unknown[]) => fetchMock(...args),
}));

describe('SlidesMetaStore', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('load() stores resolved meta on 200', async () => {
    fetchMock.mockResolvedValueOnce({ status: 'resolved', hash: 'h', pageCount: 4 });
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ status: 'resolved', hash: 'h', pageCount: 4 });
    expect(s.error).toBeNull();
  });

  it('load() stores SlidesStatus body on 422 (via err.data)', async () => {
    fetchMock.mockRejectedValueOnce({
      data: { kind: 'no-config-no-file' },
      message: '422',
    });
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ kind: 'no-config-no-file' });
    expect(s.error).toBeNull();
  });

  it('load() stores message on network failure (no err.data)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toBeNull();
    expect(s.error).toBe('network down');
  });
});
