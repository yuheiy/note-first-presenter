import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { InlineConfig } from 'vite';
import { findClosestPkgJsonPath } from 'vitefu';
import type { NoteFirstPresenterConfig } from '../config';
import type { SlidesStatus } from '../slides';
import { noteFirstPresenterPlugin } from '../plugin';

export async function resolveClientRoot(): Promise<string> {
  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  return path.dirname(clientPkgJson);
}

export interface CreateViteConfigInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  mode: 'dev' | 'build';
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig(input: CreateViteConfigInput): InlineConfig {
  const { clientRoot, isStatic, outDir, cwd, slidesStatus, fullConfig, mode } = input;
  return {
    root: clientRoot,
    configFile: false,
    appType: 'spa',
    resolve: {
      alias: {
        $lib: path.join(clientRoot, 'src/lib'),
      },
    },
    define: {
      __NFP_STATIC__: JSON.stringify(isStatic),
    },
    plugins: [
      svelte(),
      paraglideVitePlugin({
        project: path.join(clientRoot, 'project.inlang'),
        outdir: path.join(clientRoot, 'src/lib/paraglide'),
        strategy: ['preferredLanguage', 'baseLocale'],
      }),
      noteFirstPresenterPlugin({ cwd, slidesStatus, fullConfig, mode }),
    ],
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
