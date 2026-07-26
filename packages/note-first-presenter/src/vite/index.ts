import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { InlineConfig } from 'vite';
import { DEFAULT_ROUTER_MODE, type RouterMode } from '../config.ts';
import { ViteNfpPlugin } from './plugin.ts';

export interface CreateViteConfigInput {
  clientRoot: string;
  outDir?: string;
  projectCwd?: string;
  routerMode?: RouterMode;
  base?: string;
}

// The inline config is the only source of truth for the app build (configFile:
// false, see docs/adr/0014). Plain Vite + React: appType stays at its default
// ('spa'), so dev falls back to index.html for anything the nfp middleware does
// not claim, and the build finds `<root>/index.html` without a rollupOptions
// input. In history mode that fallback is load-bearing rather than a nicety —
// the slideshow opens as a fresh document at `/slideshow` — which is why the
// build also emits a 404.html (docs/adr/0017, commands/build.ts).
export function createViteConfig({
  outDir,
  clientRoot,
  projectCwd,
  routerMode = DEFAULT_ROUTER_MODE,
  base,
}: CreateViteConfigInput): InlineConfig {
  return {
    root: clientRoot,
    configFile: false,
    // Vite normalises this (leading and trailing slash) and republishes it as
    // import.meta.env.BASE_URL, which is the client's only channel for it.
    // `undefined` needs no guard: resolveBaseUrl takes it as a defaulted
    // parameter, so an explicit undefined and an absent key both mean '/'.
    base,
    // The mode has no such channel, and it must be known before the first
    // render, so it is folded in as a literal — the same trick Slidev plays with
    // __SLIDEV_HASH_ROUTE__, carrying the value rather than a boolean.
    define: { __NFP_ROUTER_MODE__: JSON.stringify(routerMode) },
    // Only `build` supplies an outDir; dev has no output to place, so it gets no
    // build section rather than a default that would resolve inside the client
    // package. cli.ts always passes an absolute path, which lands outside `root`
    // — Vite refuses to clear such a directory unless told to, and the
    // adapter-static this replaces did clear it (builder.rimraf), so
    // emptyOutDir keeps stale assets from surviving a rebuild.
    ...(outDir === undefined ? {} : { build: { outDir, emptyOutDir: true } }),
    plugins: [tailwindcss(), react(), ViteNfpPlugin({ cwd: projectCwd })],
  };
}
