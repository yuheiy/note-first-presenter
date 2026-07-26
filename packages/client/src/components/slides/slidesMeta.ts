import { atom } from 'jotai';
import { atomWithRefresh, unwrap } from 'jotai/utils';
import { startTransition } from 'react';
import { api } from '../../lib/serverClient';
import { m } from '../../lib/paraglide/messages.js';
import { dataUrl } from '../../lib/routes';

/**
 * What the CLI knows about the slide deck.
 *
 * Every arm of this union is data, not an error: `no-config-no-file` is the
 * ordinary state of a fresh project and is drawn as a hint. Both modes answer
 * with the same 200 JSON — dev from the CLI middleware, the static build from
 * the file `build` wrote — so only a transport or server fault is an error.
 */
export type SlidesMeta =
  | { kind: 'resolved'; hash: string; pageCount: number; width?: number; height?: number }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

/** What to tell the reader about the deck, when there is no deck to draw. */
export interface SlidesMetaStatus {
  /** `hint` is an ordinary state to explain; `error` is something that went wrong. */
  tone: 'hint' | 'error';
  message: string;
}

/**
 * Turns the fetched metadata into the one sentence the reader needs, or `null`
 * when the deck resolved and the slides speak for themselves.
 *
 * Both pages call this. The workspace draws `hint` and `error` differently; the
 * slideshow ignores `tone` and shows the message on its black field. Keeping the
 * four arms here rather than in two components is what stops the three that
 * agree from drifting apart, and it keeps them reachable from a Node test.
 *
 * It takes no transport failure any more: that is a thrown error now, and the
 * ErrorBoundary around each caller draws it (`docs/adr/0018`). Every *shape* the
 * server can answer with is data, and this function only ever sees those.
 */
export function describeSlidesMeta(meta: SlidesMeta): SlidesMetaStatus | null {
  // No `default` arm on purpose: a fifth `SlidesMeta` kind should fail type-check
  // here rather than quietly fall through to silence.
  switch (meta.kind) {
    case 'resolved':
      return null;
    case 'no-config-no-file':
      // Writing notes before there are slides is a normal way to start, so this
      // is guidance rather than a failure.
      return { tone: 'hint', message: m.no_pdf_yet_hint() };
    case 'configured-but-missing':
      return {
        tone: 'error',
        message: m.configured_pdf_missing_error({ path: meta.configuredPath }),
      };
    case 'no-config-multiple-files':
      return {
        tone: 'error',
        message: m.multiple_pdfs_ambiguous_error({ files: meta.candidates.join(', ') }),
      };
  }
}

const META_URL = dataUrl('nfp-data/meta.json');

/** 16:9, used until the metadata lands and for any deck that does not report its size. */
const DEFAULT_SLIDE_ASPECT = 16 / 9;

/**
 * The CLI's `ViteNfpPlugin` pushes this custom event over Vite's HMR WebSocket
 * whenever the watched PDF/config settles into a new state (ADR-0008).
 */
export const SLIDES_CHANGED_EVENT = 'nfp:slides-changed';

export interface SlidesChangedHot {
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

export function onSlidesChanged(
  handler: () => void,
  hot: SlidesChangedHot | undefined = import.meta.hot,
): () => void {
  if (!hot) return () => {};
  hot.on(SLIDES_CHANGED_EVENT, handler);
  return () => hot.off(SLIDES_CHANGED_EVENT, handler);
}

/**
 * The slide metadata, kept fresh in dev. Reading it suspends.
 *
 * The subscription lives on the atom rather than in a hook because that is what
 * the lifetime actually is: this stays fresh for exactly as long as something is
 * reading it. A hook would leak the question of who owns the subscription out to
 * every call site. `import.meta.hot` only exists in dev, so `onSlidesChanged`
 * folds away to a no-op in the static build.
 *
 * Two things below are load-bearing and neither is obvious:
 *
 * - **`startTransition` is required.** Without it the boundary falls back to its
 *   loading state while the new request is in flight, and a PDF change blinks
 *   the slide list. Nothing static catches its absence and the fetch is too fast
 *   to see it locally; `e2e/liveUpdate.e2e.ts` is the only guard (ADR-0018).
 * - **`refresh` must be called with no arguments.** `atomWithRefresh` throws in
 *   dev otherwise, and Vite hands HMR listeners the event payload, so passing
 *   `refresh` straight to `onSlidesChanged` would do exactly that. The
 *   `() => void` signature hides it from the type checker.
 */
export const slidesMetaAtom = /*#__PURE__*/ atomWithRefresh(() => api<SlidesMeta>(META_URL));

slidesMetaAtom.onMount = (refresh) =>
  onSlidesChanged(() => {
    startTransition(() => {
      refresh();
    });
  });

/**
 * The deck's aspect ratio, 16:9 until the metadata says otherwise.
 *
 * The one read in the app that is a value rather than a suspension, and the
 * exception the rest of `docs/adr/0018` is written against. It earns it: the
 * ratio has a meaningful default (16:9), it belongs on the workspace's root grid
 * where both panels' `--scroll-tail` can query it, and there is no error to
 * report if it never arrives. A consumer with a real default and nowhere to
 * report a failure wants a value; everything else wants a boundary.
 *
 * `unwrap` also holds the previous ratio across a refresh, so swapping in a deck
 * of a different shape does not make the layout jump twice.
 *
 * **The `catch` is not defensive padding.** `unwrap` rethrows a rejection rather
 * than swallowing it — that is the documented difference from `loadable` — and
 * this atom is read in the workspace shell, which is above every boundary the
 * app has. Without the catch, a failed metadata request takes the toolbar and
 * the theme footer down with it, which is the exact failure the shell was
 * decomposed to prevent.
 */
export const slideAspectAtom = /*#__PURE__*/ unwrap(
  // `await`, not a bare `get`: jotai's `get` does not resolve promises, so
  // reading an async atom without it yields the promise and every field off it
  // is `undefined`. Here the type checker catches the mistake; the same slip in
  // a `selectAtom` does not always (ADR-0018).
  atom(async (get) => {
    try {
      const meta = await get(slidesMetaAtom);
      return meta.kind === 'resolved' && meta.width && meta.height
        ? meta.width / meta.height
        : DEFAULT_SLIDE_ASPECT;
    } catch {
      // The panels that *can* report this failure do; the layout just keeps its
      // default shape.
      return DEFAULT_SLIDE_ASPECT;
    }
  }),
  (previous) => previous ?? DEFAULT_SLIDE_ASPECT,
);
