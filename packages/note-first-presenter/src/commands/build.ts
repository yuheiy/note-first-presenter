import { mkdir, rm, writeFile } from 'node:fs/promises';
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
  const previousCwd = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  // Vite derives import.meta.env.DEV (and Svelte dev compilation) from an
  // inherited NODE_ENV, so a caller environment like NODE_ENV=test would
  // silently produce a dev-mode artifact that talks to the live /api/*.
  process.env.NODE_ENV = 'production';
  process.chdir(clientRoot);
  try {
    await viteBuild(await createViteConfig({ clientRoot, outDir }));
  } finally {
    process.chdir(previousCwd);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const db = await readDb();

  const dataDir = path.join(outDir, 'nfp-data');
  await mkdir(dataDir, { recursive: true });
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
    JSON.stringify({
      kind: 'resolved',
      hash: rendered.hash,
      pageCount: rendered.slides.length,
    }),
    'utf8',
  );

  console.log(`Built static site to ${outDir}`);
}
