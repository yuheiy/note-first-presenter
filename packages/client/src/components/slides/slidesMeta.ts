import { useEffect, useState } from 'react';
import { api } from '../../lib/serverClient';
import type { MessageFormatter } from '../useMessages';
import { createResourceLoader, useResource, type Resource } from '../useResource';

/**
 * What the CLI knows about the slide deck.
 *
 * Every arm of this union is data, not an error: `no-config-no-file` is the
 * ordinary state of a fresh project and is drawn as a hint. Both modes answer
 * with the same 200 JSON — dev from the CLI middleware, the static build from
 * the file `build` wrote — so only a transport or server fault is an error
 * (§2.1).
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
 * when there is nothing to say — either because the deck resolved and the slides
 * speak for themselves, or because the request is still in flight.
 *
 * Both pages call this. The workspace draws `hint` and `error` differently; the
 * slideshow ignores `tone` and shows the message on its black field. Keeping the
 * five arms here rather than in two components is what stops the four that agree
 * (§5.7) from drifting apart, and it keeps them reachable from a Node test.
 *
 * @param error The transport-level failure, if the request itself did not land.
 *   Every *shape* the server can answer with is data, not an error (§2.1).
 */
export function describeSlidesMeta(
  meta: SlidesMeta | null,
  error: string | null,
  format: MessageFormatter,
): SlidesMetaStatus | null {
  if (meta === null) {
    // No metadata: either the request failed — in which case the message comes
    // from the transport and has no catalog entry — or it is still loading.
    return error === null ? null : { tone: 'error', message: error };
  }

  // No `default` arm on purpose: a sixth `SlidesMeta` kind should fail type-check
  // here rather than quietly fall through to silence.
  switch (meta.kind) {
    case 'resolved':
      return null;
    case 'no-config-no-file':
      // Writing notes before there are slides is a normal way to start, so this
      // is guidance rather than a failure.
      return { tone: 'hint', message: format('infoNoSlides') };
    case 'configured-but-missing':
      return {
        tone: 'error',
        message: format('errorSlidesNotFound', { path: meta.configuredPath }),
      };
    case 'no-config-multiple-files':
      return {
        tone: 'error',
        message: format('errorMultiplePdfs', { files: meta.candidates.join(', ') }),
      };
  }
}

const META_URL = '/nfp-data/meta.json';

/** Exported for the same reason as `loadDb`: the entry warms it (§1.3). */
export const loadSlidesMeta = createResourceLoader(() => api<SlidesMeta>(META_URL));

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
 * The slide metadata, kept fresh in dev.
 *
 * All three pages use this one hook. Re-fetching in place — rather than letting
 * the CLI reload the page — is what preserves the outline editing context when a
 * PDF changes under the editor. `import.meta.hot` only exists in dev, so the
 * whole subscription folds away in the static build.
 *
 * The previous data stays on screen across a refresh (the resource only changes
 * once the new one lands), so a PDF change does not blink the slide list back to
 * its loading state.
 */
export function useSlidesMeta(): Resource<SlidesMeta> {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return onSlidesChanged(() => {
      setGeneration((previous) => previous + 1);
    });
  }, []);

  return useResource(loadSlidesMeta, generation);
}
