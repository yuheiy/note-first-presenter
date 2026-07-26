import { slideImageUrl } from '../../lib/slideFilename';
import { useMessages } from '../useMessages';

export interface SlideImageProps {
  /** Identifies the rendered deck; part of the image URL. */
  hash: string;
  /** 1-based slide number. */
  slide: number;
}

/**
 * One rendered page of the deck.
 *
 * A bare `<img>`: there is no interaction to get right, so React Aria has nothing
 * to offer here (§5.1). The URL comes from `slideFilename.ts`, the single source
 * for it in both modes (§2.2).
 *
 * The alt text is not a prop. Every caller can say only the same thing — which
 * slide this is — and both of them had been saying it in hardcoded English, one
 * line away from a translated message.
 */
export function SlideImage({ hash, slide }: SlideImageProps) {
  const format = useMessages();
  return (
    <img
      src={slideImageUrl(hash, slide)}
      alt={format('slideLabel', { n: slide })}
      loading="lazy"
      className="h-full w-full object-contain"
    />
  );
}
