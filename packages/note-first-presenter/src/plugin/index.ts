import type { Plugin } from 'vite';
import { loadNfpConfig } from '../config/load-config';
import { resolveSlidesPath } from '../config/resolve-slides-path';
import { createApiMiddleware } from '../middleware/api';
import { initFileWatchers } from './file-watchers';
import {
  buildModeModuleSource,
  buildRuntimeConfigObject,
  type RuntimeConfigInput,
} from './virtual-modules';

const MODE_ID = 'virtual:nfp/mode';
const RESOLVED_MODE_ID = '\0' + MODE_ID;

export type NfpPluginOptions = RuntimeConfigInput;

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    resolveId(id) {
      if (id === MODE_ID) return RESOLVED_MODE_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_MODE_ID) return buildModeModuleSource(current.mode);
      return null;
    },
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
