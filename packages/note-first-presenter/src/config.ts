import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { loadConfigFromFile } from 'vite';
import { resolveSlidesPath, type SlidesStatus } from './slides';

export const configSchema = v.strictObject({
  slides: v.optional(v.string()),
  build: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
    }),
  ),
  export: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
      imageDir: v.optional(v.string()),
      format: v.optional(
        v.strictObject({
          template: v.string(),
          extension: v.string(),
        }),
      ),
    }),
  ),
});

export type NoteFirstPresenterConfig = v.InferOutput<typeof configSchema>;

const CONFIG_NAMES = ['note-first-presenter.config.ts', 'note-first-presenter.config.js'] as const;

export interface LoadedProject {
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
  slidesStatus: SlidesStatus;
}

export async function loadConfigAndSlides(cwd: string = process.cwd()): Promise<LoadedProject> {
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  return { config, filePath, slidesStatus };
}

export async function loadNfpConfig(cwd: string = process.cwd()): Promise<{
  config: NoteFirstPresenterConfig | null;
  filePath: string | null;
}> {
  for (const name of CONFIG_NAMES) {
    const fullPath = path.join(cwd, name);
    if (!existsSync(fullPath)) continue;
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      fullPath,
      cwd,
    );
    if (!loaded) continue;
    const parsed = v.parse(configSchema, loaded.config);
    return { config: parsed, filePath: fullPath };
  }
  return { config: null, filePath: null };
}

export interface BuildOptions {
  outDir: string;
}

export interface ResolveBuildArgs {
  cwd?: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string };
}

export function resolveBuildOptions({
  cwd = process.cwd(),
  config,
  flags,
}: ResolveBuildArgs): BuildOptions {
  const configured = config?.build?.outDir;
  const dir = flags.outDir ?? configured ?? 'dist';
  return { outDir: path.resolve(cwd, dir) };
}

export interface ExportOptions {
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string | null;
  extension: string;
}

export interface ResolveExportArgs {
  cwd?: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string; imageDir?: string; template?: string };
}

export function resolveExportOptions({
  cwd = process.cwd(),
  config,
  flags,
}: ResolveExportArgs): ExportOptions {
  const exportCfg = config?.export;
  const template = flags.template ?? exportCfg?.format?.template;
  const extension = exportCfg?.format?.extension ?? 'html';
  const outDir = path.resolve(cwd, flags.outDir ?? exportCfg?.outDir ?? 'export');
  const imageDir = path.resolve(outDir, flags.imageDir ?? exportCfg?.imageDir ?? 'images');
  const imageRelDir = path.relative(outDir, imageDir).split(path.sep).join('/') || '.';
  return {
    outDir,
    imageDir,
    imageRelDir,
    templatePath: template ? path.resolve(cwd, template) : null,
    extension,
  };
}
