import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import type { RouterMode } from '../config.ts';
import { readDb } from '../db.ts';
import { missingSlidesMeta, nfpCacheRoot, openSlides, type SlidesStatus } from '../slides.ts';
import { createViteConfig } from '../vite/index.ts';

export interface BuildInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  clientRoot: string;
  outDir: string;
  routerMode?: RouterMode;
  base?: string;
}

export async function build({
  cwd,
  slidesStatus,
  clientRoot,
  outDir,
  routerMode,
  base,
}: BuildInput): Promise<void> {
  const previousNodeEnv = process.env.NODE_ENV;
  // Vite derives import.meta.env.DEV from an inherited NODE_ENV, so a caller
  // environment like NODE_ENV=test would silently ship the Editor (db writes,
  // live-reload) in the static artifact.
  process.env.NODE_ENV = 'production';
  try {
    await viteBuild(createViteConfig({ clientRoot, outDir, routerMode, base }));
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  // The SPA fallback document, still a single shell rather than one file per
  // route. In history mode the slideshow arrives as a fresh `GET /slideshow`, so
  // a host that does not rewrite would answer 404 without this; GitHub Pages
  // serves 404.html for exactly that, preserving the URL so the app can boot.
  // Emitted unconditionally, as Slidev does: a hash-mode site never reaches it,
  // and making its presence depend on the mode buys nothing.
  await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '404.html'));

  const db = await readDb(cwd);

  const dataDir = path.join(outDir, 'nfp-data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (slidesStatus.kind !== 'resolved') {
    // Not an error: a site can be built before its deck exists, and the client
    // draws the same hint the dev server would.
    await writeFile(
      path.join(dataDir, 'meta.json'),
      JSON.stringify(missingSlidesMeta(cwd, slidesStatus)),
      'utf8',
    );
    return;
  }

  const slides = openSlides(slidesStatus.path, { cacheRoot: nfpCacheRoot(cwd) });
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
      width: rendered.slides[0]?.width,
      height: rendered.slides[0]?.height,
    }),
    'utf8',
  );

  console.log(`Built static site to ${outDir}`);
}
