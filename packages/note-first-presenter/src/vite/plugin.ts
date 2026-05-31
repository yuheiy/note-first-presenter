import type { Plugin } from 'vite';
import type { NoteFirstPresenterConfig } from '../config';
import { loadNfpConfig } from '../config';
import { cacheRootFor, resolveSlidesPath, type SlidesStatus } from '../slides';
import { dbPathFor } from '../notes';
import { createApiMiddleware } from './api';
import { initFileWatchers } from './watchers';

export interface NfpPluginOptions {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  mode: 'dev' | 'build';
}

export function ViteNfpPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    configureServer(server) {
      server.middlewares.use(
        createApiMiddleware(() => ({
          dbPath: dbPathFor(current.cwd),
          cacheRoot: cacheRootFor(current.cwd),
          slidesStatus: current.slidesStatus,
        })),
      );
      closeWatchers = initFileWatchers({
        cwd: current.cwd,
        slidesStatus: current.slidesStatus,
        vite: server,
        onChange: async () => {
          const { config, filePath } = await loadNfpConfig(current.cwd);
          const slidesStatus = await resolveSlidesPath({
            cwd: current.cwd,
            configuredSlides: config?.slides,
            configFile: filePath,
          });
          current = { ...current, fullConfig: config, slidesStatus };
          server.ws.send({ type: 'full-reload' });
        },
      });
    },
    async closeBundle() {
      await closeWatchers?.();
    },
  };
}
