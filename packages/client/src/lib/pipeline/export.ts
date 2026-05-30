import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { readDb } from '../server/db-io';
import { DEFAULT_HTML_TEMPLATE } from './default-template';
import { buildExportContext } from './context';
import { splitNoteGroups } from './note-tree';
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

  const template =
    opts.templatePath === null
      ? DEFAULT_HTML_TEMPLATE
      : await fs.readFile(opts.templatePath, 'utf8');
  const output = new Eta().renderString(template, context);

  await fs.mkdir(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, `${opts.name}.${opts.extension}`);
  await fs.writeFile(outFile, output, 'utf8');
  return outFile;
}
