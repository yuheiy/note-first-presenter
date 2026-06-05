import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import { readDb } from '../db';
import { splitNoteGroups, type NoteNode } from '../notes';
import { openSlides, type RenderAllResult, type SlidesStatus } from '../slides';

export interface ExportSlide {
  number: number;
  image: string | null;
  width: number;
  height: number;
  notes: NoteNode[];
  readonly notesMarkdown: string;
  readonly notesHtml: string;
}

export interface ExportContext {
  title: string;
  slides: ExportSlide[];
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
  assetsRelDir: string;
}

export function buildExportContext(opts: BuildContextOptions): ExportContext {
  const { rendered, groups, assetsRelDir } = opts;
  const count = Math.max(rendered.slides.length, groups.length);
  const slides: ExportSlide[] = [];
  for (let i = 0; i < count; i++) {
    const rs = rendered.slides[i];
    const notes = groups[i] ?? [];
    slides.push({
      number: i + 1,
      image: rs ? `${assetsRelDir}/${rs.file}` : null,
      width: rs?.width ?? 0,
      height: rs?.height ?? 0,
      notes,
      get notesMarkdown() {
        return toMarkdown(notes);
      },
      get notesHtml() {
        return toHtml(notes);
      },
    });
  }
  return { title: opts.title, slides };
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
<%~ slide.notesHtml %>
<% }) %>
</body>
</html>
`;

export interface ExportAsPageInput {
  slidesStatus: SlidesStatus;
  outDir: string;
  assetsDir: string;
  assetsRelDir: string;
  template: string | null;
  filename: string;
}

export async function exportAsPage({
  slidesStatus,
  outDir,
  assetsDir,
  assetsRelDir,
  template,
  filename,
}: ExportAsPageInput): Promise<void> {
  if (slidesStatus.kind !== 'resolved') {
    throw new Error(`slides not available: ${slidesStatus.kind}`);
  }
  const rendered = await openSlides(slidesStatus.path).renderAll(assetsDir);
  const db = await readDb();
  const groups = splitNoteGroups(db.outline);
  const context = buildExportContext({
    title: db.title,
    rendered,
    groups,
    assetsRelDir,
  });

  const output = new Eta().renderString(template ?? DEFAULT_TEMPLATE, context);

  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, filename);
  await fs.writeFile(outFile, output, 'utf8');
  console.log(`Exported to ${outFile}`);
}
