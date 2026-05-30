import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite-plus';

function nfpBuildVirtualModules() {
  const raw = process.env.NFP_RUNTIME_CONFIG;
  if (!raw) return null;
  const cfg = JSON.parse(raw) as { mode?: string };
  const MODE = 'virtual:nfp/mode';
  return {
    name: 'nfp-build-virtual-modules',
    resolveId(id: string) {
      if (id === MODE) return '\0' + MODE;
      return null;
    },
    load(id: string) {
      if (id === '\0' + MODE) return `export const isStatic = ${cfg.mode === 'build'};\n`;
      return null;
    },
  };
}

const nfpPlugin = nfpBuildVirtualModules();

export default defineConfig({
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['preferredLanguage', 'baseLocale'],
    }),
    ...(nfpPlugin ? [nfpPlugin] : []),
  ],
  fmt: {},
  lint: { options: { typeAware: true } },
});
