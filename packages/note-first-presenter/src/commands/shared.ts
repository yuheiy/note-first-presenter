import path from 'node:path';
import type { InlineConfig } from 'vite';
import type { NoteFirstPresenterConfig } from '../config';
import type { SlidesStatus } from '../slides';
import { createNfpVitePlugins } from '../vite';

export interface CommandContext {
  cwd?: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  clientRoot: string;
}

export interface CreateViteConfigInput extends CommandContext {
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig({
  clientRoot,
  isStatic,
  outDir,
  cwd = process.cwd(),
  slidesStatus,
  fullConfig,
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
    plugins: createNfpVitePlugins({ clientRoot, cwd, slidesStatus, fullConfig }),
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
