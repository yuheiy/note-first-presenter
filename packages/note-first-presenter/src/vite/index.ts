import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { InlineConfig } from 'vite';
import { ViteNfpPlugin } from './plugin';

export interface CreateViteConfigInput {
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig({
  isStatic,
  outDir,
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
      ViteNfpPlugin(),
    ],
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
