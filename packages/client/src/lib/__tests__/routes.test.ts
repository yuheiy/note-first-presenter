import { describe, expect, it } from 'vite-plus/test';
import { composeSlideshowHref, parseSlideParam, resolveRoutePath } from '../routes';

// Only one mode gets built at a time (`__NFP_ROUTER_MODE__` is a literal), and
// only `history` is exercised end to end — the e2e budget goes to `--base`,
// where four layers have to agree and nothing else can catch a mismatch
// (docs/adr/0017). So the mode branch is pinned here instead, by handing the
// mode in rather than reading it.
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

  // How the slide is *written* is asserted through `composeSlideshowHref`
  // below — the query builder is not part of the module's surface.
});

// The URL shapes below are the ones the browser really produces — they were read
// off a running hash-mode build before this suite was written, so they pin
// behaviour rather than restating the implementation.
const at = (pathname: string, hash = '') => ({ pathname, hash });

describe('route path', () => {
  describe('history mode', () => {
    it('reads the route as whatever follows the base', () => {
      expect(resolveRoutePath('history', '/sub/', at('/sub/slideshow'))).toBe('/slideshow');
    });

    it('reads the base itself as the workspace', () => {
      expect(resolveRoutePath('history', '/sub/', at('/sub/'))).toBe('/');
    });

    it('works at the root, where the base is just a slash', () => {
      expect([
        resolveRoutePath('history', '/', at('/slideshow')),
        resolveRoutePath('history', '/', at('/')),
      ]).toEqual(['/slideshow', '/']);
    });

    it('tolerates a trailing slash on the route', () => {
      expect(resolveRoutePath('history', '/sub/', at('/sub/slideshow/'))).toBe('/slideshow');
    });

    // A pathname outside the base cannot address a page, so it falls to the
    // workspace rather than to a page that would have to be translated. Same for
    // any typo'd URL arriving through 404.html.
    it('falls back to the workspace for anything unrecognised', () => {
      expect([
        resolveRoutePath('history', '/sub/', at('/elsewhere/slideshow')),
        resolveRoutePath('history', '/', at('/typo/deep/path')),
      ]).toEqual(['/', '/typo/deep/path']);
    });
  });

  describe('hash mode', () => {
    it('reads the route out of the hash', () => {
      expect(resolveRoutePath('hash', '/sub/', at('/sub/', '#/slideshow'))).toBe('/slideshow');
    });

    // The whole point of hash mode: the route is the same however deep the
    // document is served, so the base never enters into it.
    it('ignores the base entirely', () => {
      expect(
        resolveRoutePath('hash', '/deeply/nested/', at('/deeply/nested/', '#/slideshow')),
      ).toBe('/slideshow');
    });

    it('reads an empty hash as the workspace', () => {
      expect([
        resolveRoutePath('hash', '/', at('/', '')),
        resolveRoutePath('hash', '/', at('/', '#/')),
      ]).toEqual(['/', '/']);
    });

    // The query lives in the real location.search, never in the hash, so the
    // pathname carries it and the hash stays a bare route.
    it('is unaffected by the slide query', () => {
      expect(resolveRoutePath('hash', '/', at('/', '#/slideshow'))).toBe('/slideshow');
    });

    // A URL this app never emits, but one a reader might type. It is *not*
    // accepted: the query stays part of the route string, matches nothing, and
    // falls to the workspace. Tolerating it would mean opening the slideshow
    // while silently dropping the slide number.
    it('does not accept a query inside the hash', () => {
      expect(resolveRoutePath('hash', '/', at('/', '#/slideshow?slide=2'))).toBe(
        '/slideshow?slide=2',
      );
    });
  });
});

describe('slideshow href', () => {
  it('puts the query after the path in history mode', () => {
    expect(composeSlideshowHref('history', '/sub/', 3)).toBe('/sub/slideshow?slide=3');
  });

  // In front of the '#', not inside it: the query has to land in the real
  // location.search, which is where useActiveSlide reads it.
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

  // The href a document opens with has to be one resolveRoutePath reads back as
  // the slideshow, or the window would open on the workspace.
  it('produces hrefs that resolve back to the slideshow route', () => {
    for (const mode of ['hash', 'history'] as const) {
      const href = new URL(composeSlideshowHref(mode, '/sub/', 3), 'https://example.com');
      expect(resolveRoutePath(mode, '/sub/', href)).toBe('/slideshow');
      expect(parseSlideParam(new URLSearchParams(href.search).get('slide'))).toBe(3);
    }
  });
});
