import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readDb } from '../server/db-io';
import { renderAllSlides } from './render-slides';

type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface WriteBuildDataOptions {
  outDir: string;
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

export async function writeBuildData(opts: WriteBuildDataOptions): Promise<void> {
  const dataDir = path.join(opts.outDir, 'nfp-data');
  await fs.mkdir(dataDir, { recursive: true });

  const db = await readDb(opts.dbPath);
  await fs.writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (opts.slidesStatus.kind !== 'resolved') {
    await fs.writeFile(path.join(dataDir, 'meta.json'), JSON.stringify(opts.slidesStatus), 'utf8');
    return;
  }

  const pendingDir = path.join(dataDir, 'slides', '__pending__');
  const rendered = await renderAllSlides({
    slidesPath: opts.slidesStatus.path,
    cacheRoot: opts.cacheRoot,
    outDir: pendingDir,
  });
  const hashDir = path.join(dataDir, 'slides', rendered.hash);
  await fs.rm(hashDir, { recursive: true, force: true });
  await fs.rename(pendingDir, hashDir);
  await fs.writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ status: 'resolved', hash: rendered.hash, pageCount: rendered.pageCount }),
    'utf8',
  );
}
