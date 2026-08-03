// The source-agnostic contract for a deck's rendered form. `slides/pdf.ts`
// implements it; nothing here may import an implementation, so the modules
// that describe slides and the module that renders them cannot form a cycle.

export interface RenderedSlide {
  number: number;
  width: number;
  height: number;
  file: string;
}

// Names a rendered slide on disk and, identically, in the `/nfp-data/slides/`
// URL space. Source-agnostic on purpose: `renderAll` writes these names, the
// dev middleware answers exactly these names, and the client builds the same
// ones — so dev and the static build expose one path shape, not two.
export function slideFilename(pageNumber: number): string {
  return `${String(pageNumber).padStart(4, '0')}.webp`;
}

export interface RenderAllResult {
  hash: string;
  slides: RenderedSlide[];
}

export interface Slides {
  meta(): Promise<{ hash: string; pageCount: number; width: number; height: number }>;
  image(
    pageNumber: number,
  ): Promise<{ data: Buffer; hash: string; pageCount: number; width: number; height: number }>;
  renderAll(outDir: string): Promise<RenderAllResult>;
  invalidate(): void;
}

export class PageOutOfRangeError extends Error {
  readonly page: number;
  readonly pageCount: number;

  constructor(page: number, pageCount: number) {
    super(`page ${page} out of range (1..${pageCount})`);
    this.page = page;
    this.pageCount = pageCount;
  }
}
