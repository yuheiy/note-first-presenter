/**
 * The app's URL grammar: every URL the app emits is composed here, as pure
 * functions of the router mode (`__NFP_ROUTER_MODE__`), the base
 * (`import.meta.env.BASE_URL`), and the slide.
 *
 * Composition only — *matching* URLs to pages is wouter's job, configured in
 * `App.tsx`. The two halves stay consistent because both are driven by the same
 * mode and base, and the round-trip (an href composed here opens the page it
 * names) is pinned by `src/__tests__/routing.browser.test.tsx`. The slide's
 * state and its URL mirror live in `components/slides/activeSlide.ts`, which
 * imports this grammar rather than respelling it (ADR-0017).
 */

/** The slideshow's path. The workspace has no path of its own: it is everything else. */
export const SLIDESHOW_PATH = '/slideshow';

/** The slide index rides in the query string, in both modes. */
export const SLIDE_PARAM = 'slide';

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

/** The slide the URL is asking for. Anything absent or malformed means the first. */
export function parseSlideParam(raw: string | null | undefined): number {
  const slide = Number(raw);
  return Number.isFinite(slide) && slide >= 1 ? Math.floor(slide) : 1;
}

/**
 * Writes `slide` into `params` — the one place that decides what the first slide
 * looks like, which is: nothing at all. Both the href builder and the storage
 * write-back go through here rather than each spelling the rule out.
 */
export function applySlideParam(params: URLSearchParams, slide: number): void {
  if (slide === 1) params.delete(SLIDE_PARAM);
  else params.set(SLIDE_PARAM, String(slide));
}

/** The query string addressing `slide`, including the leading `?`. Empty for the first slide. */
function slideSearch(slide: number): string {
  const params = new URLSearchParams();
  applySlideParam(params, slide);
  return params.size === 0 ? '' : `?${params.toString()}`;
}

/**
 * The href for opening the slideshow — a real document load into a named
 * window, not a client-side navigation, which is why it is composed here and
 * not by wouter (ADR-0017).
 *
 * In hash mode the query goes in front of the `#`, so it lands in the real
 * `location.search` where the active-slide storage reads it. Both branches start
 * from the base rather than from `#`, so that opening the slideshow at the first
 * slide *clears* a `?slide=` the workspace had set: a bare `#/slideshow` is
 * resolved against the current document and would inherit its query, landing on
 * the wrong slide.
 *
 * Takes mode and base rather than reading them, so the mode this build did not
 * pick is still reachable from a test.
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
