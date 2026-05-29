import type { NoteNode } from './types';

interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

function paragraphText(item: JsonNode): string {
  const para = (item.content ?? []).find((c) => c.type === 'paragraph');
  if (!para) return '';
  return (para.content ?? []).map((n) => n.text ?? '').join('');
}

function isSeparator(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  if ((item.content ?? []).length !== 1) return false;
  return paragraphText(item) === '---';
}

function toNode(item: JsonNode): NoteNode {
  const nestedList = (item.content ?? []).find((c) => c.type === 'bullet_list');
  const children = (nestedList?.content ?? []).map(toNode);
  return { text: paragraphText(item), children };
}

export function splitNoteGroups(outline: unknown): NoteNode[][] {
  const docNode = outline as JsonNode | undefined;
  const list = docNode?.type === 'doc' ? docNode.content?.[0] : undefined;
  const items = list?.type === 'bullet_list' ? (list.content ?? []) : [];
  const groups: NoteNode[][] = [[]];
  for (const item of items) {
    if (isSeparator(item)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(toNode(item));
  }
  return groups;
}
