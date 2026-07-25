import { describe, expect, it, vi } from 'vite-plus/test';
import { createResourceLoader } from '../useResource';

describe('createResourceLoader', () => {
  it('turns a fulfilled request into a ready resource', async () => {
    const load = createResourceLoader(async () => 42);

    expect(await load()).toEqual({ status: 'ready', data: 42, error: null });
  });

  it('turns a rejected request into an error resource instead of rejecting', async () => {
    const load = createResourceLoader(() => Promise.reject(new Error('offline')));

    expect(await load()).toEqual({ status: 'error', data: null, error: 'offline' });
  });

  it('requests once per generation, however many callers ask', async () => {
    const request = vi.fn().mockResolvedValue('meta');
    const load = createResourceLoader(request);

    // The entry warms the cache, then StrictMode runs the consuming effect
    // twice: three calls, one request.
    const results = await Promise.all([load(), load(), load()]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[1]);
    expect(results[2]).toEqual({ status: 'ready', data: 'meta', error: null });
  });

  it('requests again for a new generation', async () => {
    const request = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const load = createResourceLoader(request);

    await load(0);
    const refreshed = await load(1);

    expect(request).toHaveBeenCalledTimes(2);
    expect(refreshed).toEqual({ status: 'ready', data: 'second', error: null });
  });
});
