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

const CONFIG_NAMES = ['note-first-presenter.config.ts', 'note-first-presenter.config.js'] as const;

export async function loadNfpConfig(): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
}> {
  for (const name of CONFIG_NAMES) {
    if (!existsSync(name)) continue;
    const filePath = path.resolve(name);
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, filePath);
    if (!loaded) continue;
    return { config: v.parse(configSchema, loaded.config), filePath };
  }
  return { config: null, filePath: null };
}
