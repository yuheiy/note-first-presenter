import path from 'node:path';
import { runPipelineExport } from './node/pipeline/export';
import { resolveExportOptions } from './config/defaults';
import { loadNfpConfig } from './config/load-config';
import { resolveSlidesPath } from './config/resolve-slides-path';

export interface RunExportArgs {
  outDir?: string;
  imageDir?: string;
  template?: string;
}

export async function runExport(flags: RunExportArgs): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  if (slidesStatus.kind !== 'resolved') {
    throw new Error(`slides not available: ${slidesStatus.kind}`);
  }
  const opts = resolveExportOptions({ cwd, config, flags });
  const name = path.basename(slidesStatus.path, path.extname(slidesStatus.path)) || 'notes';

  const outFile = await runPipelineExport({
    slidesPath: slidesStatus.path,
    dbPath: path.join(cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(cwd, 'node_modules', '.note-first-presenter'),
    outDir: opts.outDir,
    imageDir: opts.imageDir,
    imageRelDir: opts.imageRelDir,
    templatePath: opts.templatePath,
    extension: opts.extension,
    name,
  });
  console.log(`Exported to ${outFile}`);
}
