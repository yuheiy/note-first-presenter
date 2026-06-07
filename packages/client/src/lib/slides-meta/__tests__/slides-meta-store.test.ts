import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const fetchMock = vi.fn();

vi.mock('#lib/server-client', () => ({
  api: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('#lib/runtime-mode', () => ({
  metaUrl: () => '/api/slides/meta',
}));

import { SlidesMetaStore } from '../slides-meta-store.svelte';

describe('SlidesMetaStore', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('load() stores resolved meta on 200', async () => {
    fetchMock.mockResolvedValueOnce({ kind: 'resolved', hash: 'h', pageCount: 4 });
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ kind: 'resolved', hash: 'h', pageCount: 4 });
    expect(s.error).toBeNull();
  });

  it('load() stores SlidesStatus body on 422 (via err.data)', async () => {
    fetchMock.mockRejectedValueOnce({
      data: { kind: 'no-config-no-file' },
      message: '422',
    });
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ kind: 'no-config-no-file' });
    expect(s.error).toBeNull();
  });

  it('load() stores message on network failure (no err.data)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toBeNull();
    expect(s.error).toBe('network down');
  });
});
