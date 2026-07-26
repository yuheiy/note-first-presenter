import { ErrorOverlay } from '../ErrorOverlay';
import { Hint } from '../Hint';
import { useDeck } from './deck';
import { SlideList } from './SlideList';
import { describeSlidesMeta } from './slidesMeta';

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
  const { meta, overflow } = useDeck();

  if (meta.kind === 'resolved') {
    return (
      <SlideList
        hash={meta.hash}
        overflow={overflow}
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
