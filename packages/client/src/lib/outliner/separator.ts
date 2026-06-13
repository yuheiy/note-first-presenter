import type { Node } from 'prosemirror-model';

/** A separator's text is three or more consecutive hyphens, nothing else. */
const SEPARATOR_PATTERN = /^-{3,}$/;

export function isTopLevelSeparator(item: Node): boolean {
  if (item.type.name !== 'list_item') return false;
  const first = item.firstChild;
  if (!first || first.type.name !== 'paragraph') return false;
  if (item.childCount !== 1) return false;
  return SEPARATOR_PATTERN.test(first.textContent);
}
