import { describe, expect, it } from 'vite-plus/test';
import { parseActiveSlide, withActiveSlide } from '../activeSlide';

// The URL sync itself is not guarded (spec §8.1, N1) — a stale hash is visible
// and harmless. These two are here because they are the pair that has to agree
// about where the number sits in each of the two routes.
describe('parseActiveSlide', () => {
  it('reads the number the workspace route carries', () => {
    expect(parseActiveSlide('#/3')).toBe(3);
  });

  it('reads the number the slideshow route carries', () => {
    expect(parseActiveSlide('#/slideshow/12')).toBe(12);
  });

  it('falls back to the first slide for a hash with no number', () => {
    expect([parseActiveSlide(''), parseActiveSlide('#/'), parseActiveSlide('#/slideshow')]).toEqual(
      [1, 1, 1],
    );
  });

  it('falls back to the first slide rather than trusting a hand-edited number', () => {
    expect([parseActiveSlide('#/0'), parseActiveSlide('#/-2'), parseActiveSlide('#/x')]).toEqual([
      1, 1, 1,
    ]);
  });
});

describe('withActiveSlide', () => {
  it('keeps the page it is given', () => {
    expect(withActiveSlide('#/3', 5)).toBe('#/5');
    expect(withActiveSlide('#/slideshow/3', 5)).toBe('#/slideshow/5');
  });

  it('normalises a hash that carries no number yet', () => {
    expect(withActiveSlide('', 5)).toBe('#/5');
    expect(withActiveSlide('#/slideshow', 5)).toBe('#/slideshow/5');
  });

  it('round-trips with parseActiveSlide', () => {
    expect(parseActiveSlide(withActiveSlide('#/slideshow/1', 9))).toBe(9);
  });
});
