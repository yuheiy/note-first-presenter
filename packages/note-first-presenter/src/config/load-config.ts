import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile } from 'vite-plus';
import * as v from 'valibot';
import { configSchema, type NoteFirstPresenterConfig } from './schema';

const CONFIG_NAMES = ['note-first-presenter.config.ts', 'note-first-presenter.config.js'] as const;

export async function loadNfpConfig(cwd: string): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
}> {
  for (const name of CONFIG_NAMES) {
    const fullPath = path.join(cwd, name);
    if (!existsSync(fullPath)) continue;
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      fullPath,
      cwd,
    );
    if (!loaded) continue;
    const parsed = v.parse(configSchema, loaded.config);
    return { config: parsed, filePath: fullPath };
  }
  return { config: null, filePath: null };
}
