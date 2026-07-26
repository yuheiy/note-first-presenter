/**
 * The one place that knows this app's URL space.
 *
 * There is no router library here, and nothing in the app ever navigates: the
 * two pages live in separate documents (the slideshow opens with
 * `target="nfp-slideshow"` and has no way back), so the page is decided once at
 * load and never again. What does vary is two build-time settings — the router
 * mode (`__NFP_ROUTER_MODE__`) and the base path (`import.meta.env.BASE_URL`) —
 * and every URL the app reads or writes needs both. Keeping them in one file is
 * what stops the four places that need them from each inventing their own
 * spelling (ADR-0017).
 */
import { useEffect, useState } from 'react';

/** The slideshow's path. The workspace has no path of its own: it is everything else. */
export const SLIDESHOW_PATH = '/slideshow';

/** The slide index rides in the query string, in both modes. */
const SLIDE_PARAM = 'slide';

// Vite normalises this to always start and end with '/'.
const BASE = import.meta.env.BASE_URL;

export type RouterMode = 'hash' | 'history';

/**
 * A URL under `nfp-data/`, which the dev middleware answers and the static build
 * emits as real files. BASE verbatim, trailing slash and all — hence a
 * leading-slash-free argument.
 */
export function dataUrl(path: string): string {
  return BASE + path;
}

/**
 * The route this document is on, as a path starting with `/`.
 *
 * In hash mode the route lives entirely in the hash, which is why a hash-mode
 * deploy works at any depth without being told its base. In history mode it is
 * whatever follows the base. Anything unrecognised — a typo'd URL arriving
 * through 404.html, a pathname outside the base — reads as `/`, and `/` is the
 * workspace, so there is no route that fails to resolve to a page.
 *
 * **A query inside the hash is not accepted.** `#/slideshow?slide=2` is a URL
 * this app never emits (`composeSlideshowHref` always puts the query in front of
 * the `#`), and it reads as the route `/slideshow?slide=2`, which matches
 * nothing and lands on the workspace like any other unknown URL. Deliberately
 * not tolerated: stripping the query would open the right page while silently
 * discarding the slide number, which is a worse lie than showing an unrelated
 * page.
 */
export function resolveRoutePath(
  mode: RouterMode,
  base: string,
  location: { pathname: string; hash: string },
): string {
  const rest =
    mode === 'hash'
      ? location.hash.replace(/^#\/?/, '')
      : location.pathname.startsWith(base)
        ? location.pathname.slice(base.length)
        : '';
  return `/${rest.replace(/\/$/, '')}`;
}

/**
 * This document's route. A function, not a constant: everything else in this
 * module is pure, and the node test project has no `window` to read at import
 * time. The one caller reads it once at startup — nothing navigates, so it
 * cannot change afterwards.
 */
export function currentRoutePath(): string {
  return resolveRoutePath(__NFP_ROUTER_MODE__, BASE, window.location);
}

/** The slide the URL is asking for. Anything absent or malformed means the first. */
export function parseSlideParam(raw: string | null | undefined): number {
  const slide = Number(raw);
  return Number.isFinite(slide) && slide >= 1 ? Math.floor(slide) : 1;
}

/**
 * Writes `slide` into `params` — the one place that decides what the first slide
 * looks like, which is: nothing at all. Both the href builder and the write-back
 * go through here rather than each spelling the rule out.
 */
function applySlideParam(params: URLSearchParams, slide: number): void {
  if (slide === 1) params.delete(SLIDE_PARAM);
  else params.set(SLIDE_PARAM, String(slide));
}

/** The query string addressing `slide`, including the leading `?`. Empty for the first slide. */
export function slideSearch(slide: number): string {
  const params = new URLSearchParams();
  applySlideParam(params, slide);
  return params.size === 0 ? '' : `?${params.toString()}`;
}

/**
 * The href for opening the slideshow — a real document load into a named window,
 * not a client-side navigation.
 *
 * In hash mode the query goes in front of the `#`, so it lands in the real
 * `location.search` where `useActiveSlide` reads it. Both branches start from
 * the base rather than from `#`, so that opening the slideshow at the first
 * slide *clears* a `?slide=` the workspace had set: a bare `#/slideshow` is
 * resolved against the current document and would inherit its query, landing on
 * the wrong slide.
 *
 * Takes mode and base rather than reading them, so the mode this build did not
 * pick is still reachable from a test. Same for `resolveRoutePath` above.
 */
export function composeSlideshowHref(mode: RouterMode, base: string, slide: number): string {
  const search = slideSearch(slide);
  return mode === 'hash'
    ? `${base}${search}#${SLIDESHOW_PATH}`
    : `${base}${SLIDESHOW_PATH.slice(1)}${search}`;
}

export function slideshowHref(slide: number): string {
  return composeSlideshowHref(__NFP_ROUTER_MODE__, BASE, slide);
}

/**
 * The active slide, owned by React and mirrored into the URL.
 *
 * All three pages use this one hook. The URL is read once, for the initial
 * value, and written with `replaceState` from then on: React is the source of
 * truth, the URL is a bookmarkable mirror. Nothing reads it back, and nothing
 * else writes it, so there is no listener here and no second source to drift
 * from.
 *
 * `replace`, never `push`: the slide follows the caret in the outliner, so
 * pushing would bury the back button under an entry per separator crossed.
 */
export function useActiveSlide(): [number, (slide: number) => void] {
  const [activeSlide, setActiveSlide] = useState(() =>
    parseSlideParam(new URLSearchParams(window.location.search).get(SLIDE_PARAM)),
  );

  useEffect(() => {
    // Edited in place rather than overwritten with `slideSearch()`: any other
    // query param on the URL is somebody else's (a tracking tag on a shared
    // link, say) and is none of this app's business to drop.
    const url = new URL(window.location.href);
    applySlideParam(url.searchParams, activeSlide);
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [activeSlide]);

  return [activeSlide, setActiveSlide];
}
