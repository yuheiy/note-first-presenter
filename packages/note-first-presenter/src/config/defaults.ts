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
  templatePath: string | null;
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
  const extension = exportCfg?.format?.extension ?? 'html';
  const outDir = path.resolve(args.cwd, args.flags.outDir ?? exportCfg?.outDir ?? 'export');
  const imageDir = path.resolve(outDir, args.flags.imageDir ?? exportCfg?.imageDir ?? 'images');
  const imageRelDir = path.relative(outDir, imageDir).split(path.sep).join('/');
  return {
    outDir,
    imageDir,
    imageRelDir,
    templatePath: template ? path.resolve(args.cwd, template) : null,
    extension,
  };
}
