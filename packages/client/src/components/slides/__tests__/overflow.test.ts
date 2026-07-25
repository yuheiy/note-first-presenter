import { describe, expect, it } from 'vite-plus/test';
import { computeSlideOverflow } from '../overflow';

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
