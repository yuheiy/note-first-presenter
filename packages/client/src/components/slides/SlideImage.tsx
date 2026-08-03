import { slideImageUrl } from '../../lib/slideFilename';
import { m } from '../../lib/paraglide/messages.js';

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
 * to offer here. The URL comes from `slideFilename.ts`, the single source
 * for it in both modes.
 *
 * The alt text is not a prop: every caller can say only the same thing — which
 * slide this is — so it is said here, as a translated message.
 */
export function SlideImage({ hash, slide }: SlideImageProps) {
  return (
    <img
      src={slideImageUrl(hash, slide)}
      alt={m.slide_image_alt({ n: slide })}
      loading="lazy"
      className="h-full w-full object-contain"
    />
  );
}
