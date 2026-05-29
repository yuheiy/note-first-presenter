import { isStatic } from 'virtual:nfp/mode';

export { isStatic };

export function metaUrl(): string {
  return isStatic ? '/nfp-data/meta.json' : '/api/slides/meta';
}

export function dbUrl(): string {
  return isStatic ? '/nfp-data/db.json' : '/api/db';
}

export function slideUrl(hash: string, n: number): string {
  return isStatic
    ? `/nfp-data/slides/${hash}/${String(n).padStart(4, '0')}.webp`
    : `/api/slide/${hash}/${n}`;
}
