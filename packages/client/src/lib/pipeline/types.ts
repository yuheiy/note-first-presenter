export interface NoteNode {
  text: string;
  children: NoteNode[];
}

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
