export interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

/** Text of a list_item's first child, only if that child is a paragraph. */
function paragraphText(item: JsonNode): string {
  const first = (item.content ?? [])[0];
  if (!first || first.type !== 'paragraph') return '';
  return (first.content ?? []).map((n) => n.text ?? '').join('');
}

/** A separator's text is three or more consecutive hyphens, nothing else. */
const SEPARATOR_PATTERN = /^-{3,}$/;

/** True for a top-level separator list_item (single paragraph child whose text is three or more consecutive hyphens). */
export function isSeparatorItem(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  if ((item.content ?? []).length !== 1) return false;
  return SEPARATOR_PATTERN.test(paragraphText(item));
}

/** Extract the top-level bullet_list items from an outline doc, or [] if absent. */
export function docToItems(outline: unknown): JsonNode[] {
  const doc = outline as JsonNode | undefined;
  if (!doc || doc.type !== 'doc') return [];
  const list = doc.content?.[0];
  if (!list || list.type !== 'bullet_list') return [];
  return list.content ?? [];
}
