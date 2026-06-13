import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import type { InlineConfig, PluginOption } from 'vite';
import { ViteNfpPlugin } from './plugin.ts';

export interface CreateViteConfigInput {
  clientRoot: string;
  outDir?: string;
  projectCwd?: string;
}

export async function createViteConfig({
  outDir,
  clientRoot,
  projectCwd,
}: CreateViteConfigInput): Promise<InlineConfig> {
  const [{ sveltekit }, { default: adapter }] = await Promise.all([
    import('@sveltejs/kit/vite'),
    import('@sveltejs/adapter-static'),
  ]);

  const outputDir = outDir ?? 'build';
  const kitPlugins = (await sveltekit({
    adapter: adapter({
      pages: outputDir,
      assets: outputDir,
      fallback: '200.html',
    }),
  })) as PluginOption[];

  return {
    root: clientRoot,
    configFile: false,
    plugins: [
      tailwindcss(),
      kitPlugins,
      paraglideVitePlugin({
        project: path.join(clientRoot, 'project.inlang'),
        outdir: path.join(clientRoot, 'src/lib/paraglide'),
        strategy: ['preferredLanguage', 'baseLocale'],
      }) as PluginOption,
      ViteNfpPlugin({ cwd: projectCwd }),
    ],
  };
}
