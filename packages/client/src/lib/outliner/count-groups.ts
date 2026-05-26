interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

function isSeparatorItem(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  const children = item.content ?? [];
  if (children.length !== 1) return false;
  const para = children[0];
  if (para.type !== 'paragraph') return false;
  const text = (para.content ?? []).map((n) => n.text ?? '').join('');
  return text === '---';
}

export function countNoteGroups(outline: unknown): number {
  const doc = outline as JsonNode | undefined;
  if (!doc || doc.type !== 'doc') return 1;
  const list = doc.content?.[0];
  if (!list || list.type !== 'bullet_list') return 1;
  let separators = 0;
  for (const item of list.content ?? []) {
    if (isSeparatorItem(item)) separators++;
  }
  return separators + 1;
}
