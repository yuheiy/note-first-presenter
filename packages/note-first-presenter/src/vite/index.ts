import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { InlineConfig } from 'vite';
import { DEFAULT_ROUTER_MODE, type RouterMode } from '../config.ts';
import { nfpCacheRoot } from '../slides.ts';
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
    // Vite derives cacheDir from `root`, and `root` here is the client package —
    // which for anyone who installed nfp is a directory inside their
    // node_modules, in pnpm's case inside the virtual store. Left alone, dev
    // writes its optimizeDeps output into somebody else's package. ADR-0016
    // already refused to generate into `clientRoot` for exactly this reason, and
    // named the ways it goes wrong: a read-only filesystem, and a `pnpm install`
    // that wipes it. That rule reaches here too; Vite's default was slipping
    // past it. The destination is the root the CLI already caches under
    // (slides/pdf.ts), which is in the project rather than in a dependency.
    //
    // Only dev supplies `projectCwd`, and only dev needs this: a build never
    // creates the directory (measured against an installed package).
    ...(projectCwd === undefined ? {} : { cacheDir: path.join(nfpCacheRoot(projectCwd), 'vite') }),
    plugins: [
      tailwindcss(),
      react(),
      // The plugin exists to serve the project directory, so it is only
      // constructed when dev names one; in a build it would be inert anyway
      // (`apply: 'serve'`).
      ...(projectCwd === undefined ? [] : [ViteNfpPlugin({ cwd: projectCwd })]),
    ],
  };
}
