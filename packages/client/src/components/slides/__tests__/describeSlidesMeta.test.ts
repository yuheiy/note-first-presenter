import { describe, expect, it } from 'vite-plus/test';
import { m } from '../../../lib/paraglide/messages.js';
import { describeSlidesMeta } from '../slidesMeta';

// The catalog's wording is not this function's job (the copy is left untested),
// so the expectations name the message rather than quote it: what the
// branching decides is which message, and with what. Comparing against the same
// function the implementation calls looks circular but is not — swap two arms and
// these fail, reword a message and they do not.

// The arms this file no longer has are gone by design rather than by omission:
// "still in flight" is a Suspense boundary now, a transport failure is a thrown
// error an ErrorBoundary draws (`docs/adr/0018`), and the three ways a deck used
// to be absent collapsed into one when detection did (`docs/adr/0019`). What is
// left is exactly the shapes the server can answer with.

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
