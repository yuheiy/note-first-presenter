import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Whether the deck the config names is there.
 *
 * Both arms carry an absolute path, including `missing`: the watcher has to
 * watch the file that is not there yet, and it can only do that with a real
 * path. Everything shown to a person goes through `forDisplay` instead.
 */
export type SlidesStatus = { kind: 'resolved'; path: string } | { kind: 'missing'; path: string };

/** The source types that can back a deck. Adding one is the ppt change point (`docs/adr/0012`). */
export const SLIDES_EXTENSIONS = ['pdf'] as const;

/** The deck a project gets when its config does not name one. */
export const DEFAULT_SLIDES_PATH = 'slides.pdf';

/**
 * The one place a deck path comes from: the configured value, or the default
 * filename when there is none.
 *
 * Nothing is searched for. An earlier version globbed `*.pdf` in the cwd and
 * adopted the file when there was exactly one, which meant the deck a project
 * used depended on what else happened to be lying next to it — see
 * `docs/adr/0019`. Applying the default here rather than at the three call
 * sites keeps "unset means slides.pdf" a fact of this function, so one test
 * covers it for dev, build and export alike.
 */
export function resolveSlides(configuredSlides: string | undefined): SlidesStatus {
  const abs = path.resolve(process.cwd(), configuredSlides ?? DEFAULT_SLIDES_PATH);
  return { kind: existsSync(abs) ? 'resolved' : 'missing', path: abs };
}

type MissingSlides = Extract<SlidesStatus, { kind: 'missing' }>;

/**
 * The deck path as a person should read it: relative to the cwd, so it matches
 * the value the author typed into the config rather than naming their home
 * directory — which a shared static build would otherwise print to its readers.
 *
 * The single place the absolute paths in `SlidesStatus` become display strings,
 * so the browser hint, the `build` artifact and the `export` error cannot end up
 * describing the same file three different ways.
 */
function forDisplay(status: MissingSlides): string {
  return path.relative(process.cwd(), status.path);
}

/** The wire form of a deck that did not resolve, for `/nfp-data/meta.json`. */
export function missingSlidesMeta(status: MissingSlides): { kind: 'missing'; path: string } {
  return { kind: 'missing', path: forDisplay(status) };
}

/**
 * What `build`/`export` say when they cannot go on without a deck.
 *
 * Names the path rather than the kind: with one `missing` arm, "slides not
 * available: missing" told the reader nothing they did not already know, and
 * the path is the only thing they can act on.
 */
export function slidesNotFoundMessage(status: MissingSlides): string {
  return `slide deck not found: ${forDisplay(status)}. Add the file, or set \`slides\` in your config.`;
}

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
  image(pageNumber: number): Promise<{ data: Buffer; hash: string; pageCount: number }>;
  size(pageNumber: number): Promise<{ width: number; height: number }>;
  renderAll(outDir: string): Promise<RenderAllResult>;
  invalidate(): void;
}

export { openPdfSlides as openSlides, PageOutOfRangeError } from './slides/pdf.ts';
