import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { InlineConfig } from 'vite';
import { ViteNfpPlugin } from './plugin.ts';

export interface CreateViteConfigInput {
  clientRoot: string;
  outDir?: string;
  projectCwd?: string;
}

// The inline config is the only source of truth for the app build (configFile:
// false, see docs/adr/0014). Plain Vite + React: appType stays at its default
// ('spa'), so dev falls back to index.html for anything the nfp middleware does
// not claim, and the build finds `<root>/index.html` without a rollupOptions
// input. The pages route off location.hash, which never reaches the server, so
// static hosting needs no fallback document.
export function createViteConfig({
  outDir,
  clientRoot,
  projectCwd,
}: CreateViteConfigInput): InlineConfig {
  return {
    root: clientRoot,
    configFile: false,
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
