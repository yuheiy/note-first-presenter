import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { InlineConfig } from 'vite';
import type { SlidesStatus } from '../slides';
import { ViteNfpPlugin } from './plugin';

export interface CreateViteConfigInput {
  cwd?: string;
  slidesStatus: SlidesStatus;
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig({
  isStatic,
  outDir,
  cwd = process.cwd(),
  slidesStatus,
  clientRoot,
}: CreateViteConfigInput): InlineConfig {
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
      ViteNfpPlugin({ cwd, slidesStatus }),
    ],
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
