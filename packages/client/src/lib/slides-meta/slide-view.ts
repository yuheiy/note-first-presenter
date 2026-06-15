import { m } from '$lib/paraglide/messages';
import type { SlidesMeta } from './slides-meta-store.svelte';

/**
 * The renderable state of the slide surface, resolved from the raw
 * `SlidesMeta` wire value plus any transport error. Both the editor's slide
 * panel and the slideshow consume this single discriminated view:
 *
 *   - `resolved` carries everything needed to render slides (hash, page count,
 *     PDF dimensions).
 *   - `hint` is an informational, non-error state (e.g. no slides configured).
 *   - `error` is a failure the user should act on; `message` is localized.
 *   - `pending` is the pre-load state with neither meta nor error yet.
 *
 * Centralizing this here keeps the `kind → message` mapping and the knowledge
 * that a transport error may carry a `SlidesMeta` payload out of every surface.
 */
export type SlideView =
  | { kind: 'resolved'; hash: string; pageCount: number; width?: number; height?: number }
  | { kind: 'hint'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'pending' };

export function resolveSlideView(meta: SlidesMeta | null, error: string | null): SlideView {
  switch (meta?.kind) {
    case 'resolved':
      return {
        kind: 'resolved',
        hash: meta.hash,
        pageCount: meta.pageCount,
        width: meta.width,
        height: meta.height,
      };
    case 'no-config-no-file':
      return { kind: 'hint', message: m.info_no_slides() };
    case 'configured-but-missing':
      return { kind: 'error', message: m.error_slides_not_found({ path: meta.configuredPath }) };
    case 'no-config-multiple-files':
      return {
        kind: 'error',
        message: m.error_multiple_pdfs({ files: meta.candidates.join(', ') }),
      };
    default:
      return error === null ? { kind: 'pending' } : { kind: 'error', message: error };
  }
}
