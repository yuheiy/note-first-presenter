import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { dbPathFor, readDb } from '../notes';
import {
  cacheRootFor,
  ensurePdfState,
  getSlidesMeta,
  renderAllSlides,
  type SlidesStatus,
} from '../slides';
import { createViteConfig, type CommandContext } from './shared';

export interface BuildInput extends CommandContext {
  outDir: string;
}

export async function build(input: BuildInput): Promise<void> {
  const { cwd, slidesStatus, fullConfig, clientRoot, outDir } = input;

  await viteBuild(
    createViteConfig({
      cwd,
      slidesStatus,
      fullConfig,
      mode: 'build',
      clientRoot,
      isStatic: true,
      outDir,
    }),
  );

  await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '200.html'));

  await writeBuildData({
    outDir,
    dbPath: dbPathFor(cwd),
    cacheRoot: cacheRootFor(cwd),
    slidesStatus,
  });
}

interface WriteBuildDataOptions {
  outDir: string;
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

export async function writeBuildData(opts: WriteBuildDataOptions): Promise<void> {
  const dataDir = path.join(opts.outDir, 'nfp-data');
  await mkdir(dataDir, { recursive: true });

  const db = await readDb(opts.dbPath);
  await writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (opts.slidesStatus.kind !== 'resolved') {
    await writeFile(path.join(dataDir, 'meta.json'), JSON.stringify(opts.slidesStatus), 'utf8');
    return;
  }

  ensurePdfState({ slidesPath: opts.slidesStatus.path, cacheRoot: opts.cacheRoot });
  const { hash } = await getSlidesMeta();
  const slidesDir = path.join(dataDir, 'slides', hash);
  await rm(slidesDir, { recursive: true, force: true });
  const rendered = await renderAllSlides({
    slidesPath: opts.slidesStatus.path,
    cacheRoot: opts.cacheRoot,
    outDir: slidesDir,
  });
  await writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ status: 'resolved', hash: rendered.hash, pageCount: rendered.pageCount }),
    'utf8',
  );
}
