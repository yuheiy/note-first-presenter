import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { loadConfigFromFile } from 'vite';

/**
 * Where the route lives in the URL. Named and valued after Slidev's headmatter
 * option of the same name; the URL *shape* underneath is nfp's own, since the
 * slide index is a search param rather than a path segment (docs/adr/0017).
 */
export const ROUTER_MODES = ['hash', 'history'] as const;
export type RouterMode = (typeof ROUTER_MODES)[number];
export const DEFAULT_ROUTER_MODE: RouterMode = 'history';

const configSchema = v.strictObject({
  slides: v.optional(v.string()),
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

export async function loadNfpConfig(command: 'dev' | 'build'): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
  dependencies: string[];
}> {
  const env =
    command === 'dev'
      ? ({ command: 'serve', mode: 'development' } as const)
      : ({ command: 'build', mode: 'production' } as const);
  for (const name of CONFIG_FILENAMES) {
    if (!existsSync(name)) continue;
    const filePath = path.resolve(name);
    const loaded = await loadConfigFromFile(env, filePath);
    if (!loaded) continue;
    return {
      config: v.parse(configSchema, loaded.config),
      filePath,
      dependencies: loaded.dependencies.map((d) => path.resolve(d)),
    };
  }
  return { config: null, filePath: null, dependencies: [] };
}
