import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { countNoteGroups } from '../outliner/noteGroups';
import { outlineAtom, useStoredDocument } from '../workspace/db';
import { computeSlideOverflow, type SlideOverflow } from './overflow';
import { slidesMetaAtom, type SlidesMeta } from './slidesMeta';

/**
 * Half of the deck's length — the other half is the PDF's page count.
 *
 * Recomputed whenever the outline moves, but compared with `Object.is`, so the
 * slide list is spared a re-render unless a `---` was added or removed. This
 * replaces a hand-written guard in the Editor that existed because React's
 * bail-out on an equal value lapses whenever the fiber already has another
 * update pending; a `selectAtom` that never bumps its own epoch has no such
 * lapse.
 *
 * Hangs off `outlineAtom` rather than the document, so a title keystroke does
 * not walk the outline.
 */
const groupCountAtom = /*#__PURE__*/ selectAtom(outlineAtom, (outline) =>
  outline === null ? 0 : countNoteGroups(outline),
);

export interface Deck {
  meta: SlidesMeta;
  overflow: SlideOverflow;
}

/**
 * How long the deck is and where the PDF stops covering it. Suspends until both
 * halves are known.
 *
 * The two callers — the slide list and the count broadcast — need exactly this
 * and nothing else, and both must be able to suspend so that the shell around
 * them does not have to.
 *
 * `useStoredDocument()` is called for the wait, not the value: the working
 * document is synchronous by design and would answer a group count of 0 while
 * the request is still open. It never changes once it lands, so an edit does not
 * re-render either caller.
 */
export function useDeck(): Deck {
  const meta = useAtomValue(slidesMetaAtom);
  useStoredDocument();
  const groupCount = useAtomValue(groupCountAtom);
  const pageCount = meta.kind === 'resolved' ? meta.pageCount : 0;
  return { meta, overflow: computeSlideOverflow(pageCount, groupCount) };
}
