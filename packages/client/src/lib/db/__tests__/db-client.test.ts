import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DbStore } from '../client.svelte';
import { defaultDb } from '../schema';

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

  it('setTitle() debounces save by 500ms', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('a');
    s.setTitle('ab');
    s.setTitle('abc');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'abc' }));
  });

  it('flush() reports saveStatus transitions on success', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(500);
    expect(s.saveStatus).toBe('idle');
    expect(s.lastError).toBeNull();
  });

  it('flush() captures error message on save failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(500);
    expect(s.saveStatus).toBe('error');
    expect(s.lastError).toBe('boom');
  });
});
