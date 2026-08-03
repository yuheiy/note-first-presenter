import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { defaultDb, type DbV1 } from '../../../lib/dbSchema';
import { createDbSaver, SAVE_DEBOUNCE_MS, SAVE_RETRY_MS, type SaveStatus } from '../dbSaver';

function doc(title: string): DbV1 {
  return { ...defaultDb(), title };
}

// G1: the outline is the one asset that cannot be regenerated, and a save that
// never happens fails silently. Everything below is about that.
describe('createDbSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid edits into one save of the newest document', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDbSaver({ save });

    saver.schedule(doc('a'));
    saver.schedule(doc('ab'));
    saver.schedule(doc('abc'));
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'abc' }));
  });

  it('reports saving then idle for a save that succeeds', async () => {
    const statuses: SaveStatus[] = [];
    const saver = createDbSaver({
      save: async () => {},
      onStatusChange: (status) => statuses.push(status),
    });

    saver.schedule(doc('x'));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(statuses).toEqual(['saving', 'idle']);
  });

  it('retries a failed save and settles back to idle', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const statuses: SaveStatus[] = [];
    const saver = createDbSaver({ save, onStatusChange: (status) => statuses.push(status) });

    saver.schedule(doc('x'));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(statuses).toEqual(['saving', 'error']);

    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'x' }));
    expect(statuses).toEqual(['saving', 'error', 'saving', 'idle']);
  });

  it('retries with the newest edit when one arrives after a failure', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const saver = createDbSaver({ save });

    saver.schedule(doc('old'));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule(doc('new'));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'new' }));
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
    const saver = createDbSaver({ save });

    saver.schedule(doc('a'));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // Edit arrives while the first save is still in flight.
    saver.schedule(doc('b'));
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'b' }));
  });

  it('does not overlap concurrent flush() calls', async () => {
    let resolveFirst: () => void = () => {};
    const firstCall = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const save = vi.fn().mockImplementationOnce(() => firstCall);
    const saver = createDbSaver({ save });

    saver.schedule(doc('a'));
    const first = saver.flush();
    const second = saver.flush();
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush() sends a pending edit without waiting out the debounce window', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDbSaver({ save });

    saver.schedule(doc('a'));
    await saver.flush();

    // This is the pagehide path: the edit is gone from the page either way, so
    // it has to be on the wire before the debounce timer would have fired.
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'a' }));
  });

  it('flush() is a no-op when nothing is pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDbSaver({ save });

    await saver.flush();

    expect(save).not.toHaveBeenCalled();
  });
});
