import { Hint } from '../Hint';
import { useDeck } from './deck';
import { SlideList } from './SlideList';
import { describeSlidesMeta } from './slidesMeta';

/**
 * The workspace's slide list, and whatever stands in for it.
 *
 * A component of its own rather than a method on the shell, because it is where
 * both reads that can fail happen. Its ErrorBoundary sits just outside, so a
 * failed request takes out this panel and leaves the toolbar, the outliner and
 * the theme footer standing.
 */
export function SlidePanel() {
  const { meta, overflow } = useDeck();

  if (meta.kind === 'resolved') {
    return <SlideList hash={meta.hash} overflow={overflow} />;
  }

  // A deck that is not there yet is a sentence to show rather than a failure to
  // report. The slideshow page shows the same sentence.
  const message = describeSlidesMeta(meta);
  if (!message) return null;
  return <Hint message={message} />;
}
