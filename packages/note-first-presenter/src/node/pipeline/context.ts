import { toHtml, toMarkdown } from './format';
import type { RenderAllResult } from '../../slides';
import type { NoteNode } from '../../notes';
import type { ExportContext, ExportSlide } from './types';

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
