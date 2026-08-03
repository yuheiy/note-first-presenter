import type { Node } from 'prosemirror-model';
import { LIST_ITEM, PARAGRAPH } from './nodes';

/** A separator's text is three or more consecutive hyphens, nothing else. */
const SEPARATOR_PATTERN = /^-{3,}$/;

/**
 * The one text-level separator rule (`docs/adr/0006`). Both predicates — the
 * ProseMirror one below and the JSON one in `jsonDoc.ts` — defer to this, so
 * the two representations of a stored outline cannot drift apart.
 */
export function isSeparatorText(text: string): boolean {
  return SEPARATOR_PATTERN.test(text);
}

export function isTopLevelSeparator(item: Node): boolean {
  if (item.type !== LIST_ITEM) return false;
  const first = item.firstChild;
  if (!first || first.type !== PARAGRAPH) return false;
  if (item.childCount !== 1) return false;
  return isSeparatorText(first.textContent);
}
