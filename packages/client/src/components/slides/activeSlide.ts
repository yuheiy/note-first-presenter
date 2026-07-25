import { useEffect, useState } from 'react';

// There are exactly two routes, and the slide number is the last segment of
// both: `#/3` for the workspace, `#/slideshow/3` for the slideshow (§1.2). The
// same prefix decides the page in main.tsx.
const SLIDESHOW_PREFIX = '#/slideshow';

export function parseActiveSlide(hash: string): number {
  const slide = Number(hash.slice(hash.lastIndexOf('/') + 1));
  return Number.isFinite(slide) && slide >= 1 ? Math.floor(slide) : 1;
}

/** The hash addressing the same page, at `slide`. Anything malformed normalises. */
export function withActiveSlide(hash: string, slide: number): string {
  return hash.startsWith(SLIDESHOW_PREFIX) ? `${SLIDESHOW_PREFIX}/${slide}` : `#/${slide}`;
}

/**
 * The active slide, owned by React and mirrored into the URL.
 *
 * All three pages use this one hook, which is what removes the duplicated
 * hydrate/write-back the Svelte version had in each of them. The URL is read
 * once, for the initial value, and written with `replaceState` from then on:
 * React is the source of truth, the URL is a bookmarkable mirror that adds no
 * history entries and fires neither `hashchange` nor `popstate` (§3.5).
 */
export function useActiveSlide(): [number, (slide: number) => void] {
  const [activeSlide, setActiveSlide] = useState(() => parseActiveSlide(location.hash));

  useEffect(() => {
    const hash = withActiveSlide(location.hash, activeSlide);
    if (hash !== location.hash) history.replaceState(history.state, '', hash);
  }, [activeSlide]);

  return [activeSlide, setActiveSlide];
}
