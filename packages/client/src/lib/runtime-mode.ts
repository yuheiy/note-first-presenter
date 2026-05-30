import { slideFilename } from './slide-filename';

declare const __NFP_STATIC__: boolean;
export const isStatic = __NFP_STATIC__;

export function metaUrl(): string {
  return isStatic ? '/nfp-data/meta.json' : '/api/slides/meta';
}

export function dbUrl(): string {
  return isStatic ? '/nfp-data/db.json' : '/api/db';
}

export function slideUrl(hash: string, n: number): string {
  return isStatic ? `/nfp-data/slides/${hash}/${slideFilename(n)}` : `/api/slide/${hash}/${n}`;
}
