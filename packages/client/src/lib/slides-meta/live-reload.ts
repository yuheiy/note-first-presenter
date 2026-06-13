/**
 * Live partial-update channel for the Editor (dev only).
 *
 * The CLI's `ViteNfpPlugin` pushes a `nfp:slides-changed` custom event over
 * Vite's HMR WebSocket whenever the watched PDF/config settles into a new state
 * (see docs/adr/0008). Subscribing here lets the Editor re-fetch slide metadata
 * in place instead of triggering a full page reload, preserving the outline
 * editing context. `import.meta.hot` only exists in dev, so this is a no-op in
 * the static production build.
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
