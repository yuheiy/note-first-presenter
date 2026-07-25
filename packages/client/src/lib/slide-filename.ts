function slideFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(4, '0')}.webp`;
}

// The single URL source for slide images, shared by both modes: in dev the
// CLI middleware serves this path out of the PDF, and the static build writes
// the identical tree under `nfp-data/`.
export function slideImageUrl(hash: string, pageNumber: number): string {
  return `/nfp-data/slides/${hash}/${slideFilename(pageNumber)}`;
}
