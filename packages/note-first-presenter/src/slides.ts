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
 * The per-project cache root, shared by the rendered-slide cache
 * (`slides/pdf.ts`) and dev's Vite cacheDir (`vite/index.ts`): inside the
 * project's own node_modules, never inside an installed dependency (ADR-0016).
 */
export function nfpCacheRoot(cwd: string): string {
  return path.join(cwd, 'node_modules', '.note-first-presenter');
}

/**
 * The one place a deck path comes from: the configured value, or the default
 * filename when there is none, resolved against the project directory.
 *
 * Nothing is searched for — a PDF sitting next to the project is not a deck
 * unless it is the one the config names (`docs/adr/0019`). Applying the default
 * here rather than at the three call sites keeps "unset means slides.pdf" a
 * fact of this function, so one test covers it for dev, build and export alike.
 */
export function resolveSlides(cwd: string, configuredSlides: string | undefined): SlidesStatus {
  const abs = path.resolve(cwd, configuredSlides ?? DEFAULT_SLIDES_PATH);
  return { kind: existsSync(abs) ? 'resolved' : 'missing', path: abs };
}

type MissingSlides = Extract<SlidesStatus, { kind: 'missing' }>;

/**
 * The deck path as a person should read it: relative to the project directory,
 * so it matches the value the author typed into the config rather than naming
 * their home directory — which a shared static build would otherwise print to
 * its readers.
 *
 * The single place the absolute paths in `SlidesStatus` become display strings,
 * so the browser hint, the `build` artifact and the `export` error cannot end up
 * describing the same file three different ways.
 */
function forDisplay(cwd: string, status: MissingSlides): string {
  return path.relative(cwd, status.path);
}

/** The wire form of a deck that did not resolve, for `/nfp-data/meta.json`. */
export function missingSlidesMeta(
  cwd: string,
  status: MissingSlides,
): { kind: 'missing'; path: string } {
  return { kind: 'missing', path: forDisplay(cwd, status) };
}

/**
 * What `build`/`export` say when they cannot go on without a deck. Names the
 * path, because the path is the one thing the reader can act on.
 */
export function slidesNotFoundMessage(cwd: string, status: MissingSlides): string {
  return `slide deck not found: ${forDisplay(cwd, status)}. Add the file, or set \`slides\` in your config.`;
}

export {
  PageOutOfRangeError,
  type RenderAllResult,
  slideFilename,
  type Slides,
} from './slides/model.ts';
export { openPdfSlides as openSlides } from './slides/pdf.ts';
