import { useDeck } from './deck';
import { useSyncPublisher } from './sync';

/**
 * Broadcasts the deck's shape to the slideshow window. Draws nothing.
 *
 * A component rather than a call in the shell because it needs the deck's
 * length, so it is a place that can suspend, and the shell must not be.
 * Publishing simply does not happen until there is something true to say —
 * better than the shell's old behaviour of broadcasting a count of 0 while the
 * requests were still in flight.
 */
export function SlideCountPublisher({ activeSlide }: { activeSlide: number }) {
  const { overflow } = useDeck();
  useSyncPublisher(activeSlide, overflow.slideCount);
  return null;
}
