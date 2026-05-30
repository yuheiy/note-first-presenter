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

  let output: string;
  if (opts.templatePath === null) {
    output = new Eta().renderString(DEFAULT_HTML_TEMPLATE, context);
  } else {
    const eta = new Eta({ views: path.dirname(opts.templatePath) });
    output = eta.render(path.basename(opts.templatePath), context);
  }

  await fs.mkdir(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, `${opts.name}.${opts.extension}`);
  await fs.writeFile(outFile, output, 'utf8');
  return outFile;
}
