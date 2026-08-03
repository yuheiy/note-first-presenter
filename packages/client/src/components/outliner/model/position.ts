import type { Node, ResolvedPos } from 'prosemirror-model';
import { BULLET_LIST, LIST_ITEM, PARAGRAPH } from './nodes';

/** Absolute position of `parent.child(index)`, given the position just inside `parent`. */
export function childItemPos(parent: Node, parentStart: number, index: number): number {
  let pos = parentStart;
  for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
  return pos;
}

/** Depth of the nearest list_item ancestor of `$pos`, or null when there is none. */
export function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

export interface ItemAncestor {
  itemPos: number;
  parent: Node;
  parentPos: number;
  /** Index of the list_item within its parent bullet_list. */
  index: number;
}

/** The nearest list_item ancestor of `$pos`, with its parent bullet_list context. */
export function findListItemAncestor($pos: ResolvedPos): ItemAncestor | null {
  const depth = findListItemDepth($pos);
  if (depth === null) return null;
  const parent = $pos.node(depth - 1);
  if (parent.type !== BULLET_LIST) return null;
  return {
    itemPos: $pos.before(depth),
    parent,
    parentPos: $pos.before(depth - 1) + 1,
    index: $pos.index(depth - 1),
  };
}

/**
 * Position just inside the first paragraph of the list_item at `itemPos`:
 * +1 opens the list_item, +1 opens the paragraph the schema puts first
 * (`list_item = paragraph block*`).
 */
export function paragraphStartOf(itemPos: number): number {
  return itemPos + 2;
}

/**
 * Position at the end of the first paragraph's text of the list_item at
 * `itemPos`, or null when no list_item with a leading paragraph sits there.
 */
export function paragraphEndOf(doc: Node, itemPos: number): number | null {
  if (itemPos < 0 || itemPos > doc.content.size) return null;
  const item = doc.nodeAt(itemPos);
  if (!item || item.type !== LIST_ITEM) return null;
  const paragraph = item.firstChild;
  if (!paragraph || paragraph.type !== PARAGRAPH) return null;
  return paragraphStartOf(itemPos) + paragraph.content.size;
}

/**
 * Transaction meta flag that callers (e.g. `rangeAwareSinkListItem`) use to
 * tell the `textSelectionClamp` plugin that the multi-item TextSelection they
 * just set is intentional and should be left alone. Lives here, with the rest
 * of the item-boundary vocabulary, so commands do not have to import from
 * `plugins/`.
 */
export const SKIP_TEXT_SELECTION_CLAMP_META = 'nfp-skip-text-selection-clamp';
