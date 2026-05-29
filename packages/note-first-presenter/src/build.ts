import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import { findClosestPkgJsonPath } from 'vitefu';
import { writeBuildData } from '@note-first-presenter/client/pipeline/build-data';
import { resolveBuildOptions } from './config/defaults';
import { loadNfpConfig } from './config/load-config';
import { resolveSlidesPath } from './config/resolve-slides-path';
import { noteFirstPresenterPlugin } from './plugin';

export interface RunBuildArgs {
  outDir?: string;
}

export async function runBuild(flags: RunBuildArgs): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  const { outDir } = resolveBuildOptions({ cwd, config, flags });

  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  const clientRoot = path.dirname(clientPkgJson);

  process.chdir(clientRoot);
  process.env.NFP_STATIC = '1';
  process.env.NFP_OUT_DIR = outDir;

  await build({
    root: clientRoot,
    configFile: path.join(clientRoot, 'vite.config.ts'),
    plugins: [noteFirstPresenterPlugin({ cwd, slidesStatus, fullConfig: config, mode: 'build' })],
  });

  await writeBuildData({
    outDir,
    dbPath: path.join(cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(cwd, 'node_modules', '.note-first-presenter'),
    slidesStatus,
  });

  console.log(`Built static site to ${outDir}`);
}
