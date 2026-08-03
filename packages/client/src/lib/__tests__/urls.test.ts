import { describe, expect, it } from 'vite-plus/test';
import { applySlideParam, composeSlideshowHref, parseSlideParam } from '../urls';

// Only one mode gets built at a time (`__NFP_ROUTER_MODE__` is a literal), and
// only `history` is exercised end to end — the e2e budget goes to `--base`,
// where four layers have to agree and nothing else can catch a mismatch
// (docs/adr/0017). So the mode branch is pinned here instead, by handing the
// mode in rather than reading it. Which page each of these URLs *opens* is the
// other half of the round trip, pinned by `src/__tests__/routing.browser.test.tsx`
// against the real wouter setup.
describe('slide param', () => {
  it('reads the number the query carries', () => {
    expect(parseSlideParam('12')).toBe(12);
  });

  it('reads a missing parameter as the first slide', () => {
    expect([parseSlideParam(null), parseSlideParam(undefined), parseSlideParam('')]).toEqual([
      1, 1, 1,
    ]);
  });

  it('normalises anything malformed to the first slide', () => {
    expect([parseSlideParam('0'), parseSlideParam('-2'), parseSlideParam('x')]).toEqual([1, 1, 1]);
  });

  it('truncates a fractional slide rather than rejecting it', () => {
    expect(parseSlideParam('3.7')).toBe(3);
  });

  // The write side of the same rule: the first slide is spelled as no parameter
  // at all, and writing it *removes* one that is there. The href builder below
  // and the activeSlide storage both delegate to this.
  it('spells the first slide as an absent parameter', () => {
    const params = new URLSearchParams('slide=4&utm=x');
    applySlideParam(params, 1);
    expect(params.toString()).toBe('utm=x');
  });
});

describe('slideshow href', () => {
  it('puts the query after the path in history mode', () => {
    expect(composeSlideshowHref('history', '/sub/', 3)).toBe('/sub/slideshow?slide=3');
  });

  // In front of the '#', not inside it: the query has to land in the real
  // location.search, which is where the activeSlide storage reads it.
  it('puts the query before the hash in hash mode', () => {
    expect(composeSlideshowHref('hash', '/sub/', 3)).toBe('/sub/?slide=3#/slideshow');
  });

  // The first slide has no parameter — and the href still has to start from the
  // base so it clears one the workspace left behind. A bare '#/slideshow' is
  // resolved against the current document and would inherit its query, opening
  // on the wrong slide.
  it('clears a leftover query when opening on the first slide', () => {
    expect(composeSlideshowHref('hash', '/sub/', 1)).toBe('/sub/#/slideshow');
    expect(composeSlideshowHref('history', '/sub/', 1)).toBe('/sub/slideshow');
  });

  it('addresses the root deploy too', () => {
    expect([composeSlideshowHref('history', '/', 1), composeSlideshowHref('hash', '/', 2)]).toEqual(
      ['/slideshow', '/?slide=2#/slideshow'],
    );
  });
});
