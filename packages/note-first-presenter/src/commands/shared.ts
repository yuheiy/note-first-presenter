import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';
import { findClosestPkgJsonPath } from 'vitefu';
import { loadNfpConfig, type NoteFirstPresenterConfig } from '../config';
import { resolveSlidesPath, type SlidesStatus } from '../slides';
import { createNfpVitePlugins } from '../vite';

export async function resolveClientRoot(): Promise<string> {
  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  return path.dirname(clientPkgJson);
}

export interface CliContext {
  cwd: string;
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
  slidesStatus: SlidesStatus;
}

export async function loadCliContext(cwd: string): Promise<CliContext> {
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  return { cwd, config, filePath, slidesStatus };
}

export interface CommandContext {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  clientRoot: string;
}

export interface CreateViteConfigInput extends CommandContext {
  mode: 'dev' | 'build';
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig(input: CreateViteConfigInput): InlineConfig {
  const { clientRoot, isStatic, outDir, cwd, slidesStatus, fullConfig, mode } = input;
  return {
    root: clientRoot,
    configFile: false,
    appType: 'spa',
    resolve: {
      alias: {
        $lib: path.join(clientRoot, 'src/lib'),
      },
    },
    define: {
      __NFP_STATIC__: JSON.stringify(isStatic),
    },
    plugins: createNfpVitePlugins({ clientRoot, cwd, slidesStatus, fullConfig, mode }),
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
