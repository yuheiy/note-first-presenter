import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { readDb } from '../db';
import { openSlides, type SlidesStatus } from '../slides';
import { createViteConfig } from '../vite';

export interface BuildInput {
  slidesStatus: SlidesStatus;
  clientRoot: string;
  outDir: string;
}

export async function build({ slidesStatus, clientRoot, outDir }: BuildInput): Promise<void> {
  await viteBuild(createViteConfig({ slidesStatus, clientRoot, isStatic: true, outDir }));

  await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '200.html'));

  await writeBuildData({ outDir, slidesStatus });
}

interface WriteBuildDataOptions {
  outDir: string;
  slidesStatus: SlidesStatus;
}

export async function writeBuildData({
  outDir,
  slidesStatus,
}: WriteBuildDataOptions): Promise<void> {
  const dataDir = path.join(outDir, 'nfp-data');
  await mkdir(dataDir, { recursive: true });

  const db = await readDb();
  await writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (slidesStatus.kind !== 'resolved') {
    await writeFile(path.join(dataDir, 'meta.json'), JSON.stringify(slidesStatus), 'utf8');
    return;
  }

  const slides = openSlides(slidesStatus.path);
  const { hash } = await slides.meta();
  const slidesDir = path.join(dataDir, 'slides', hash);
  await rm(slidesDir, { recursive: true, force: true });
  const rendered = await slides.renderAll(slidesDir);
  await writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ status: 'resolved', hash: rendered.hash, pageCount: rendered.pageCount }),
    'utf8',
  );
}
