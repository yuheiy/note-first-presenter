import { describe, expect, it, vi } from 'vite-plus/test';
import { m } from '../../../lib/paraglide/messages.js';
import {
  describeSlidesMeta,
  onSlidesChanged,
  SLIDES_CHANGED_EVENT,
  type SlidesChangedHot,
} from '../slidesMeta';

// The catalog's wording is not this function's job (the copy is left untested),
// so the expectations name the message rather than quote it: what the
// branching decides is which message, and with what. Comparing against the same
// function the implementation calls looks circular but is not — swap two arms and
// these fail, reword a message and they do not.
describe('describeSlidesMeta', () => {
  it('says nothing once a deck resolves — the slide list speaks for itself', () => {
    expect(describeSlidesMeta({ kind: 'resolved', hash: 'abc', pageCount: 3 })).toBeNull();
  });

  it('treats a deck that is not there as a hint, not a failure', () => {
    expect(describeSlidesMeta({ kind: 'missing', path: 'slides.pdf' })).toEqual(
      m.slides_missing_hint({ path: 'slides.pdf' }),
    );
  });

  it('names the path it was given rather than a fixed string', () => {
    // Guards the interpolation itself: with `{path}` dropped from the message
    // both of these would be the same sentence.
    const first = describeSlidesMeta({ kind: 'missing', path: 'a.pdf' });
    const second = describeSlidesMeta({ kind: 'missing', path: 'b.pdf' });
    expect(first).not.toEqual(second);
    expect(first).toContain('a.pdf');
  });
});

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
