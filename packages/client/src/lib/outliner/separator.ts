import type { Node } from 'prosemirror-model';

export function isTopLevelSeparator(item: Node): boolean {
  if (item.type.name !== 'list_item') return false;
  const first = item.firstChild;
  if (!first || first.type.name !== 'paragraph') return false;
  if (item.childCount !== 1) return false;
  return first.textContent === '---';
}
