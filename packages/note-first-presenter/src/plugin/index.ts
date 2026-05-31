import type { Plugin } from 'vite';
import { loadNfpConfig } from '../config';
import { resolveSlidesPath } from '../slides';
import { createApiMiddleware } from '../vite/api';
import { initFileWatchers } from '../vite/watchers';
import { buildRuntimeConfigObject, type RuntimeConfigInput } from './virtual-modules';

export type NfpPluginOptions = RuntimeConfigInput;

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    configureServer(server) {
      server.middlewares.use(
        createApiMiddleware(() => {
          const rc = buildRuntimeConfigObject(current);
          return { dbPath: rc.dbPath, cacheRoot: rc.cacheRoot, slidesStatus: rc.slidesStatus };
        }),
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
