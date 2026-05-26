import { api } from '$lib/server-client';

export type SlidesMeta =
  | { status: 'resolved'; hash: string; pageCount: number }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export class SlidesMetaStore {
  data: SlidesMeta | null = $state(null);
  error: string | null = $state(null);

  async load() {
    try {
      this.data = await api<SlidesMeta>('/api/slides/meta');
      this.error = null;
    } catch (err) {
      const cause = err as { data?: SlidesMeta; message?: string };
      if (cause.data) {
        this.data = cause.data;
        this.error = null;
      } else {
        this.error = cause.message ?? String(err);
      }
    }
  }
}
