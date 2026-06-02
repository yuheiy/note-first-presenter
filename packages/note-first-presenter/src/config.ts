import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { loadConfigFromFile } from 'vite';

export const configSchema = v.strictObject({
  slides: v.optional(v.string()),
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
