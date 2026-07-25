import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const fetchMock = vi.fn();

vi.mock('$lib/server-client', () => ({
  api: (...args: unknown[]) => fetchMock(...args),
}));

import { SlidesMetaStore } from '../slides-meta-store.svelte';

describe('SlidesMetaStore', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('load() reads resolved meta from /nfp-data/meta.json', async () => {
    fetchMock.mockResolvedValueOnce({ kind: 'resolved', hash: 'h', pageCount: 4 });
    const s = new SlidesMetaStore();
    await s.load();
    expect(fetchMock).toHaveBeenCalledWith('/nfp-data/meta.json');
    expect(s.data).toEqual({ kind: 'resolved', hash: 'h', pageCount: 4 });
    expect(s.error).toBeNull();
  });

  it('load() stores an unresolved kind as ordinary data, not an error', async () => {
    fetchMock.mockResolvedValueOnce({ kind: 'no-config-no-file' });
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ kind: 'no-config-no-file' });
    expect(s.error).toBeNull();
  });

  it('load() stores message on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toBeNull();
    expect(s.error).toBe('network down');
  });
});
