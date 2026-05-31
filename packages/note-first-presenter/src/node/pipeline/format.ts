import type { NoteNode } from '../../notes';

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
