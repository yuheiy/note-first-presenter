import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { dbPathFor, readDb, splitNoteGroups, type NoteNode } from '../notes';
import { cacheRootFor, renderAllSlides, type RenderAllResult, type SlidesStatus } from '../slides';

export interface ExportSlide {
  number: number;
  image: string | null;
  width: number;
  height: number;
  notes: NoteNode[];
}

export interface ExportContext {
  title: string;
  slideCount: number;
  slides: ExportSlide[];
  toMarkdown: (notes: NoteNode[]) => string;
  toHtml: (notes: NoteNode[]) => string;
}

export function toMarkdown(notes: NoteNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: NoteNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}- ${node.text}`);
      walk(node.children, depth + 1);
    }
  };
  walk(notes, 0);
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function toHtml(notes: NoteNode[]): string {
  if (notes.length === 0) return '';
  const items = notes
    .map((node) => `<li>${escapeHtml(node.text)}${toHtml(node.children)}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}

export interface BuildContextOptions {
  title: string;
  rendered: RenderAllResult;
  groups: NoteNode[][];
  imageRelDir: string;
}

export function buildExportContext(opts: BuildContextOptions): ExportContext {
  const { rendered, groups, imageRelDir } = opts;
  const count = Math.max(rendered.pageCount, groups.length);
  const slides: ExportSlide[] = [];
  for (let i = 0; i < count; i++) {
    const rs = rendered.slides[i];
    slides.push({
      number: i + 1,
      image: rs ? `${imageRelDir}/${rs.file}` : null,
      width: rs?.width ?? 0,
      height: rs?.height ?? 0,
      notes: groups[i] ?? [],
    });
  }
  return { title: opts.title, slideCount: count, slides, toMarkdown, toHtml };
}

// The built-in export template, inlined as a module string so it is bundled
// into the packed CLI. A standalone .eta asset would not be tracked by the
// bundler and would be missing from dist/ at runtime.
export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title><%= it.title %></title>
</head>
<body>
<h1><%= it.title %></h1>
<% it.slides.forEach(function (slide) { %>
<% if (slide.image) { %><figure><img src="<%= slide.image %>" width="<%= slide.width %>" height="<%= slide.height %>"<% if (slide.number > 1) { %> loading="lazy"<% } %> alt="" /></figure><% } %>
<%~ it.toHtml(slide.notes) %>
<% }) %>
</body>
</html>
`;

interface PipelineExportOptions {
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

async function runPipelineExport(opts: PipelineExportOptions): Promise<string> {
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

export interface ExportPageInput {
  slidesStatus: SlidesStatus;
  cwd: string;
  outDir: string;
  imageDir: string;
  imageRelDir: string;
  templatePath: string | null;
  extension: string;
  name: string;
}

export async function exportPage(input: ExportPageInput): Promise<string> {
  if (input.slidesStatus.kind !== 'resolved') {
    throw new Error(`slides not available: ${input.slidesStatus.kind}`);
  }
  return runPipelineExport({
    slidesPath: input.slidesStatus.path,
    dbPath: dbPathFor(input.cwd),
    cacheRoot: cacheRootFor(input.cwd),
    outDir: input.outDir,
    imageDir: input.imageDir,
    imageRelDir: input.imageRelDir,
    templatePath: input.templatePath,
    extension: input.extension,
    name: input.name,
  });
}
