import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { readDb, splitNoteGroups } from '../../notes';
import { buildExportContext } from './context';
import { DEFAULT_TEMPLATE } from './default-template';
import { renderAllSlides } from './render-slides';

export interface PipelineExportOptions {
  slidesPath: string;
  dbPath: string;
  cacheRoot: string;
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string | null;
  extension: string;
  name: string;
}

export async function runPipelineExport(opts: PipelineExportOptions): Promise<string> {
  if (opts.templatePath !== null && !existsSync(opts.templatePath)) {
    throw new Error(`export template not found: ${opts.templatePath}`);
  }
  const rendered = await renderAllSlides({
    slidesPath: opts.slidesPath,
    cacheRoot: opts.cacheRoot,
    outDir: opts.imageDir,
  });
  const db = await readDb(opts.dbPath);
  const groups = splitNoteGroups(db.outline);
  const context = buildExportContext({
    title: db.title,
    rendered,
    groups,
    imageRelDir: opts.imageRelDir,
  });

  const output =
    opts.templatePath === null
      ? new Eta().renderString(DEFAULT_TEMPLATE, context)
      : new Eta({ views: path.dirname(opts.templatePath) }).render(
          path.basename(opts.templatePath),
          context,
        );

  await fs.mkdir(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, `${opts.name}.${opts.extension}`);
  await fs.writeFile(outFile, output, 'utf8');
  return outFile;
}
