import { describe, expect, it } from 'vite-plus/test';
import { computeSlideOverflow, stepSlide } from '../overflow';

describe('computeSlideOverflow', () => {
  it('shows one slide per PDF page when the notes ask for no more', () => {
    expect(computeSlideOverflow(3, 1)).toEqual({ slideCount: 3, overflowStart: 4 });
  });

  it('extends the deck past the PDF when the notes ask for more', () => {
    expect(computeSlideOverflow(3, 5)).toEqual({ slideCount: 5, overflowStart: 4 });
  });

  it('makes every slide an overflow when there is no PDF', () => {
    expect(computeSlideOverflow(0, 2)).toEqual({ slideCount: 2, overflowStart: 1 });
  });

  it('puts overflowStart past the last slide when the PDF covers everything', () => {
    expect(computeSlideOverflow(4, 4)).toEqual({ slideCount: 4, overflowStart: 5 });
  });

  it('reports an empty deck when neither side has slides', () => {
    expect(computeSlideOverflow(0, 0)).toEqual({ slideCount: 0, overflowStart: 1 });
  });
});

describe('stepSlide', () => {
  const deck = computeSlideOverflow(3, 0);

  it('moves by the delta inside the deck', () => {
    expect(stepSlide(deck, 1, 1)).toBe(2);
    expect(stepSlide(deck, 3, -2)).toBe(1);
  });

  it('stops at the last slide rather than wrapping', () => {
    expect(stepSlide(deck, 3, 1)).toBe(3);
  });

  it('stops at the first slide rather than wrapping', () => {
    expect(stepSlide(deck, 1, -1)).toBe(1);
  });

  it('answers 1 for a deck with no slides at all', () => {
    // The slideshow can be driven before its metadata lands and before the
    // workspace has published a count. Clamping to the upper bound alone would
    // hand back slide 0, which nothing can render and which would be mirrored
    // into the URL as `#/slideshow/0`.
    const empty = computeSlideOverflow(0, 0);
    expect(stepSlide(empty, 1, 1)).toBe(1);
    expect(stepSlide(empty, 1, -1)).toBe(1);
  });
});
