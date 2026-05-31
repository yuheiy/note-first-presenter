import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { PluginOption } from 'vite';
import { ViteNfpPlugin, type NfpPluginOptions } from './plugin';

export interface NfpVitePluginsInput extends NfpPluginOptions {
  clientRoot: string;
}

export function createNfpVitePlugins(input: NfpVitePluginsInput): PluginOption[] {
  const { clientRoot, ...nfp } = input;
  return [
    svelte(),
    paraglideVitePlugin({
      project: path.join(clientRoot, 'project.inlang'),
      outdir: path.join(clientRoot, 'src/lib/paraglide'),
      strategy: ['preferredLanguage', 'baseLocale'],
    }),
    ViteNfpPlugin(nfp),
  ];
}
