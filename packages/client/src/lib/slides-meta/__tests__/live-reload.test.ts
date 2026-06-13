import { describe, expect, it, vi } from 'vite-plus/test';
import { onSlidesChanged, SLIDES_CHANGED_EVENT, type SlidesChangedHot } from '../live-reload';

describe('onSlidesChanged', () => {
  it('returns a no-op unsubscribe when no hot context is present', () => {
    const handler = vi.fn();
    const stop = onSlidesChanged(handler, undefined);
    expect(() => stop()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('registers the handler on the slides-changed event', () => {
    const handlers = new Map<string, () => void>();
    const hot: SlidesChangedHot = {
      on: (event, cb) => handlers.set(event, cb),
      off: vi.fn(),
    };
    const handler = vi.fn();

    onSlidesChanged(handler, hot);

    expect(handlers.has(SLIDES_CHANGED_EVENT)).toBe(true);
    handlers.get(SLIDES_CHANGED_EVENT)!();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the same handler from the same event', () => {
    const off = vi.fn();
    const hot: SlidesChangedHot = { on: vi.fn(), off };
    const handler = vi.fn();

    const stop = onSlidesChanged(handler, hot);
    stop();

    expect(off).toHaveBeenCalledWith(SLIDES_CHANGED_EVENT, handler);
  });
});
