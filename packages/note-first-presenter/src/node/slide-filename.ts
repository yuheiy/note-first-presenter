export function slideFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(4, '0')}.webp`;
}
