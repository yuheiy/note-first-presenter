import { api } from '$lib/server-client';

export type SlidesMeta =
  | { kind: 'resolved'; hash: string; pageCount: number; width?: number; height?: number }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export class SlidesMetaStore {
  data: SlidesMeta | null = $state(null);
  error: string | null = $state(null);

  // Both modes answer with the same 200 JSON — dev from the CLI middleware,
  // the static build from the file `build` wrote — so every kind of the union
  // is data. Only a transport/server fault lands in `error`.
  async load() {
    try {
      this.data = await api<SlidesMeta>('/nfp-data/meta.json');
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }
}
