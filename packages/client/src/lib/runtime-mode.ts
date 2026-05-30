import { isStatic } from 'virtual:nfp/mode';
import { slideFilename } from './slide-filename';

export { isStatic };

export function metaUrl(): string {
  return isStatic ? '/nfp-data/meta.json' : '/api/slides/meta';
}

export function dbUrl(): string {
  return isStatic ? '/nfp-data/db.json' : '/api/db';
}

export function slideUrl(hash: string, n: number): string {
  return isStatic ? `/nfp-data/slides/${hash}/${slideFilename(n)}` : `/api/slide/${hash}/${n}`;
}
