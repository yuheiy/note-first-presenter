import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DbStore, SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from '../client.svelte';
import { defaultDb } from '$lib/dbSchema';

describe('DbStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with the provided initial state', () => {
    const initial = { ...defaultDb(), title: 'init' };
    const s = new DbStore({ initial, save: async () => {} });
    expect(s.state.title).toBe('init');
  });

  it('replace() sets state without scheduling a save', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.replace({ ...defaultDb(), title: 'r' });
    vi.runAllTimers();
    expect(save).not.toHaveBeenCalled();
  });

  it('setTitle() coalesces rapid edits into a single save after the debounce window', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('a');
    s.setTitle('ab');
    s.setTitle('abc');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'abc' }));
  });

  it('settles saveStatus to idle and clears lastError on a successful save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.saveStatus).toBe('idle');
    expect(s.lastError).toBeNull();
  });

  it('flush() captures error message on save failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.saveStatus).toBe('error');
    expect(s.lastError).toBe('boom');
  });

  it('retries automatically after a failed save', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.saveStatus).toBe('error');
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(s.saveStatus).toBe('idle');
  });

  it('does not drop edits made while a save is in flight', async () => {
    let resolveFirst: () => void = () => {};
    const firstCall = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(() => firstCall)
      .mockResolvedValueOnce(undefined);
    const s = new DbStore({ initial: defaultDb(), save });

    s.setTitle('a');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // Edit arrives while the first save is still in flight.
    s.setTitle('b');
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'b' }));
    expect(s.saveStatus).toBe('idle');
  });

  it('does not overlap concurrent flush() calls', async () => {
    let resolveFirst: () => void = () => {};
    const firstCall = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const save = vi.fn().mockImplementationOnce(() => firstCall);
    const s = new DbStore({ initial: defaultDb(), save });

    s.setTitle('a');
    const flushPromise1 = s.flush();
    const flushPromise2 = s.flush();
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.all([flushPromise1, flushPromise2]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush() is a no-op when there is nothing dirty', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.replace({ ...defaultDb(), title: 'r' });
    await s.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
