import { slideImageUrl } from '../../lib/slideFilename';

export interface SlideImageProps {
  /** Identifies the rendered deck; part of the image URL. */
  hash: string;
  /** 1-based slide number. */
  slide: number;
  alt: string;
}

/**
 * One rendered page of the deck.
 *
 * A bare `<img>`: there is no interaction to get right, so React Aria has nothing
 * to offer here (§5.1). The URL comes from `slideFilename.ts`, the single source
 * for it in both modes (§2.2).
 */
export function SlideImage({ hash, slide, alt }: SlideImageProps) {
  return (
    <img
      src={slideImageUrl(hash, slide)}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-contain"
    />
  );
}
