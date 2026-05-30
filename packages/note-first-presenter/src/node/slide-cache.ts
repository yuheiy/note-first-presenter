import { promises as fs } from 'node:fs';
import path from 'node:path';
import { slideFilename } from './slide-filename';

export function slideCachePath(cacheRoot: string, hash: string, pageNumber: number): string {
  return path.join(cacheRoot, 'slides', hash, slideFilename(pageNumber));
}

export async function pruneOtherHashes(cacheRoot: string, currentHash: string): Promise<void> {
  const slidesDir = path.join(cacheRoot, 'slides');
  let entries: string[];
  try {
    entries = await fs.readdir(slidesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  await Promise.all(
    entries
      .filter((name) => name !== currentHash)
      .map((name) => fs.rm(path.join(slidesDir, name), { recursive: true, force: true })),
  );
}
