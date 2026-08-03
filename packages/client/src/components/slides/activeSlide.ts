import { atomWithStorage } from 'jotai/utils';
import { applySlideParam, parseSlideParam, SLIDE_PARAM } from '../../lib/urls';

// Edited in place rather than rebuilt: any other query param on the URL is
// somebody else's (a tracking tag on a shared link, say) and is none of this
// app's business to drop.
function writeSlideToUrl(slide: number) {
  const url = new URL(window.location.href);
  applySlideParam(url.searchParams, slide);
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url);
  }
}

/**
 * The active slide, owned by this atom and mirrored into the URL.
 *
 * In jotai's vocabulary the URL is the atom's *storage*: read once at load
 * (`getOnInit` — the lazy default would flash slide 1 for a frame, and the
 * `window` guard is what keeps the module importable from node tests), written
 * on every change, and — because the storage defines no `subscribe` — never
 * read back. The atom is the source of truth, the URL a bookmarkable mirror,
 * and there is no listener to drift from.
 *
 * `replaceState`, never `pushState`: the slide follows the caret in the
 * outliner, so pushing would bury the back button under an entry per separator
 * crossed (ADR-0017).
 */
export const activeSlideAtom = atomWithStorage(
  SLIDE_PARAM,
  1,
  {
    getItem: (_key, initialValue) =>
      typeof window === 'undefined'
        ? initialValue
        : parseSlideParam(new URLSearchParams(window.location.search).get(SLIDE_PARAM)),
    setItem: (_key, slide) => {
      writeSlideToUrl(slide);
    },
    // RESET only, which nothing dispatches; the first slide is the absent param.
    removeItem: () => {
      writeSlideToUrl(1);
    },
  },
  { getOnInit: true },
);
