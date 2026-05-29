import type { Plugin } from 'vite-plus';
import { loadNfpConfig } from '../config/load-config';
import { resolveSlidesPath } from '../config/resolve-slides-path';
import { initFileWatchers } from './file-watchers';
import {
  buildModeModuleSource,
  buildVirtualConfigModuleSource,
  type RuntimeConfigInput,
} from './virtual-modules';

const MODULE_ID = 'virtual:nfp/runtime-config';
const RESOLVED_ID = '\0' + MODULE_ID;
const MODE_ID = 'virtual:nfp/mode';
const RESOLVED_MODE_ID = '\0' + MODE_ID;

export type NfpPluginOptions = RuntimeConfigInput;

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      if (id === MODE_ID) return RESOLVED_MODE_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildVirtualConfigModuleSource(current);
      if (id === RESOLVED_MODE_ID) return buildModeModuleSource(current.mode);
      return null;
    },
    configureServer(server) {
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
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        },
      });
    },
    async closeBundle() {
      await closeWatchers?.();
    },
  };
}
