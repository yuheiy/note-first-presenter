import type { Plugin } from 'vite-plus';
import { buildVirtualConfigModuleSource, type RuntimeConfigInput } from './virtual-modules';

const MODULE_ID = 'virtual:nfp/runtime-config';
const RESOLVED_ID = '\0' + MODULE_ID;

export type NfpPluginOptions = RuntimeConfigInput;

export function noteFirstPresenterPlugin(opts: NfpPluginOptions): Plugin {
  const current = opts;
  return {
    name: 'note-first-presenter',
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildVirtualConfigModuleSource(current);
      return null;
    },
  };
}
