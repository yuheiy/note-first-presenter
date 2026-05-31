export interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

/** Text of a list_item's first child, only if that child is a paragraph. */
export function paragraphText(item: JsonNode): string {
  const first = (item.content ?? [])[0];
  if (!first || first.type !== 'paragraph') return '';
  return (first.content ?? []).map((n) => n.text ?? '').join('');
}

/** True for a top-level `---` separator list_item (single paragraph child whose text is exactly "---"). */
export function isSeparatorItem(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  if ((item.content ?? []).length !== 1) return false;
  return paragraphText(item) === '---';
}

/** Extract the top-level bullet_list items from an outline doc, or [] if absent. */
export function docToItems(outline: unknown): JsonNode[] {
  const doc = outline as JsonNode | undefined;
  if (!doc || doc.type !== 'doc') return [];
  const list = doc.content?.[0];
  if (!list || list.type !== 'bullet_list') return [];
  return list.content ?? [];
}

export interface NoteNode {
  text: string;
  children: NoteNode[];
}

function toNode(item: JsonNode): NoteNode {
  const nestedList = (item.content ?? []).find((c) => c.type === 'bullet_list');
  const children = (nestedList?.content ?? []).map(toNode);
  return { text: paragraphText(item), children };
}

export function splitNoteGroups(outline: unknown): NoteNode[][] {
  const items = docToItems(outline);
  const groups: NoteNode[][] = [[]];
  for (const item of items) {
    if (isSeparatorItem(item)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(toNode(item));
  }
  return groups;
}
