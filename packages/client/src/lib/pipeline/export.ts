import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import { readDb } from '../server/db-io';
import { buildExportContext } from './context';
import { splitNoteGroups } from './note-tree';
import { renderAllSlides } from './render-slides';

const DEFAULT_TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json'))),
  'src/lib/pipeline/default-template.eta',
);

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

  const templatePath = opts.templatePath ?? DEFAULT_TEMPLATE_PATH;
  const eta = new Eta({ views: path.dirname(templatePath) });
  const output = eta.render(path.basename(templatePath), context);

  await fs.mkdir(opts.outDir, { recursive: true });
  const outFile = path.join(opts.outDir, `${opts.name}.${opts.extension}`);
  await fs.writeFile(outFile, output, 'utf8');
  return outFile;
}
