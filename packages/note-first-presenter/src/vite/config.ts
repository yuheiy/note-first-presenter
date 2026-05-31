import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { InlineConfig } from 'vite';
import { noteFirstPresenterPlugin, type NfpPluginOptions } from '../plugin';

export interface NfpViteConfigInput extends NfpPluginOptions {
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig(input: NfpViteConfigInput): InlineConfig {
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
