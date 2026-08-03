import { useAtomValue } from 'jotai';
import { activeSlideAtom } from './activeSlide';
import { useDeck } from './deck';
import { useSyncPublisher } from './sync';

/**
 * Broadcasts the deck's shape to the slideshow window. Draws nothing.
 *
 * A component rather than a call in the shell because it needs the deck's
 * length, so it is a place that can suspend, and the shell must not be.
 * The invariant: a count of 0 is never broadcast while the requests are still
 * in flight — publishing waits until there is something true to say.
 */
export function SlideCountPublisher() {
  const activeSlide = useAtomValue(activeSlideAtom);
  const { overflow } = useDeck();
  useSyncPublisher(activeSlide, overflow.slideCount);
  return null;
}
