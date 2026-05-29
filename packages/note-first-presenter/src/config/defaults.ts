import path from 'node:path';
import type { NoteFirstPresenterConfig } from './schema';

export interface BuildOptions {
  outDir: string;
}

export interface ResolveBuildArgs {
  cwd: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string };
}

export function resolveBuildOptions(args: ResolveBuildArgs): BuildOptions {
  const configured = args.config?.build?.outDir;
  const dir = args.flags.outDir ?? configured ?? 'dist';
  return { outDir: path.resolve(args.cwd, dir) };
}

export interface ExportOptions {
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string;
  extension: string;
}

export interface ResolveExportArgs {
  cwd: string;
  config: NoteFirstPresenterConfig | null;
  flags: { outDir?: string; imageDir?: string; template?: string };
}

export function resolveExportOptions(args: ResolveExportArgs): ExportOptions {
  const exportCfg = args.config?.export;
  const template = args.flags.template ?? exportCfg?.format?.template;
  const extension = exportCfg?.format?.extension;
  if (!template || !extension) {
    throw new Error('export requires "format.template" and "format.extension" in config');
  }
  const outDir = path.resolve(args.cwd, args.flags.outDir ?? exportCfg?.outDir ?? 'export');
  const imageRelDir = args.flags.imageDir ?? exportCfg?.imageDir ?? 'images';
  return {
    outDir,
    imageDir: path.resolve(outDir, imageRelDir),
    imageRelDir,
    templatePath: path.resolve(args.cwd, template),
    extension,
  };
}
