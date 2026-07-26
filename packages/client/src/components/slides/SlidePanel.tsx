import { useAtomValue } from 'jotai';
import { ErrorOverlay } from '../ErrorOverlay';
import { Hint } from '../Hint';
import { groupCountAtom, storedDbAtom } from '../workspace/db';
import { computeSlideOverflow } from './overflow';
import { SlideList } from './SlideList';
import { describeSlidesMeta, slidesMetaAtom } from './slidesMeta';
import { useSyncPublisher } from './sync';

export interface SlidePanelProps {
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
}

/**
 * The workspace's slide list, and whatever stands in for it.
 *
 * A component of its own rather than a method on the shell, because it is where
 * both reads that can fail happen. Its ErrorBoundary sits just outside, so a
 * failed request takes out this panel and leaves the toolbar, the outliner and
 * the theme footer standing — which is what the shell used to achieve by
 * threading a `status` prop down and branching on it.
 */
export function SlidePanel({ activeSlide, onActiveSlideChange }: SlidePanelProps) {
  const meta = useAtomValue(slidesMetaAtom);
  // Neither half of the deck's length is known until both requests land: the
  // note-group count comes from the document, the page count from the metadata.
  // Reading the stored document is how this waits for its half — the working
  // document is synchronous by design and would answer 0. Nothing here re-reads
  // it, so an edit does not re-render this.
  useAtomValue(storedDbAtom);
  const groupCount = useAtomValue(groupCountAtom);

  if (meta.kind === 'resolved') {
    return (
      <SlideList
        hash={meta.hash}
        overflow={computeSlideOverflow(meta.pageCount, groupCount)}
        activeSlide={activeSlide}
        onActiveSlideChange={onActiveSlideChange}
      />
    );
  }

  // Every other shape the server can answer with is a sentence to show rather
  // than a deck to draw. The slideshow page shows the same sentences.
  const state = describeSlidesMeta(meta);
  if (!state) return null;
  return state.tone === 'hint' ? (
    <Hint message={state.message} />
  ) : (
    <ErrorOverlay message={state.message} />
  );
}

/**
 * Broadcasts the deck's shape to the slideshow window. Draws nothing.
 *
 * Split out of the shell for the same reason as the panel: it needs both halves
 * of the deck's length, so it is a place that can suspend, and the shell must
 * not be. Publishing simply does not happen until there is something true to
 * say — better than the shell's old behaviour of broadcasting a count of 0
 * while the requests were still in flight.
 */
export function SlideCountPublisher({ activeSlide }: { activeSlide: number }) {
  const meta = useAtomValue(slidesMetaAtom);
  useAtomValue(storedDbAtom);
  const groupCount = useAtomValue(groupCountAtom);
  const overflow = computeSlideOverflow(meta.kind === 'resolved' ? meta.pageCount : 0, groupCount);
  useSyncPublisher(activeSlide, overflow.slideCount);
  return null;
}
