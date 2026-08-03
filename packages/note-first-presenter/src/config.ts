import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { loadConfigFromFile } from 'vite';
import { SLIDES_EXTENSIONS } from './slides.ts';

/**
 * Where the route lives in the URL. Named and valued after Slidev's headmatter
 * option of the same name; the URL *shape* underneath is nfp's own, since the
 * slide index is a search param rather than a path segment (docs/adr/0017).
 */
export const ROUTER_MODES = ['hash', 'history'] as const;
export type RouterMode = (typeof ROUTER_MODES)[number];
export const DEFAULT_ROUTER_MODE: RouterMode = 'history';

const configSchema = v.strictObject({
  // Checked here rather than at resolve time on purpose: an extension nothing
  // can render is a wrong *setting*, not a state of the filesystem, so it takes
  // the same route as a bad `routerMode` — exit 1 at startup, and the Vite error
  // overlay when a running dev server's config is edited into this shape.
  // Without it the failure surfaces as a pdfjs parse error naming nothing.
  slides: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (value) => SLIDES_EXTENSIONS.some((ext) => value.toLowerCase().endsWith(`.${ext}`)),
        `slides must name a file ending in ${SLIDES_EXTENSIONS.map((ext) => `.${ext}`).join(' or ')}`,
      ),
    ),
  ),
  // Both of these reach dev and build alike, which is why they sit at the top
  // level rather than under `build`.
  routerMode: v.optional(v.picklist(ROUTER_MODES)),
  base: v.optional(v.string()),
  build: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
    }),
  ),
  export: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
      assetsDir: v.optional(v.string()),
      filename: v.optional(v.string()),
      template: v.optional(v.string()),
    }),
  ),
});

export type NoteFirstPresenterConfig = v.InferOutput<typeof configSchema>;

export const CONFIG_FILENAMES = [
  'note-first-presenter.config.ts',
  'note-first-presenter.config.js',
] as const;

export async function loadNfpConfig(
  cwd: string,
  command: 'dev' | 'build',
): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
  dependencies: string[];
}> {
  const env =
    command === 'dev'
      ? ({ command: 'serve', mode: 'development' } as const)
      : ({ command: 'build', mode: 'production' } as const);
  for (const name of CONFIG_FILENAMES) {
    const filePath = path.resolve(cwd, name);
    if (!existsSync(filePath)) continue;
    const loaded = await loadConfigFromFile(env, filePath);
    if (!loaded) continue;
    return {
      config: v.parse(configSchema, loaded.config),
      filePath,
      // Vite reports these relative to the *process* cwd (esbuild's metafile
      // is written against it), so they resolve against that, not `cwd`.
      dependencies: loaded.dependencies.map((d) => path.resolve(d)),
    };
  }
  return { config: null, filePath: null, dependencies: [] };
}
