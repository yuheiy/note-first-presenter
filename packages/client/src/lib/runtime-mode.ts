import { slideFilename } from './slide-filename';

export function metaUrl(): string {
  return import.meta.env.DEV ? '/api/slides/meta' : '/nfp-data/meta.json';
}

export function dbUrl(): string {
  return import.meta.env.DEV ? '/api/db' : '/nfp-data/db.json';
}

export function slideUrl(hash: string, n: number): string {
  return import.meta.env.DEV
    ? `/api/slide/${hash}/${n}`
    : `/nfp-data/slides/${hash}/${slideFilename(n)}`;
}
