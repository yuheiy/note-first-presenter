import { type Node, type ResolvedPos } from 'prosemirror-model';
import { outlinerSchema } from './schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

export interface ItemAncestor {
  itemPos: number;
  parent: Node;
  parentPos: number;
  /** Index of the list_item within its parent bullet_list. */
  index: number;
}

/**
 * Depth of the nearest enclosing list_item, or null when `$pos` sits outside
 * any item. Callers use the returned depth with `$pos.node(depth)` /
 * `$pos.before(depth)` to reach the item and its boundaries.
 */
export function findItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

/**
 * Nearest enclosing list_item together with its parent bullet_list, the
 * parent's content position, and the item's index within it. Returns null when
 * `$pos` is outside any item, or the item's parent is not a bullet_list.
 */
export function findItemAncestor($pos: ResolvedPos): ItemAncestor | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) {
      const parent = $pos.node(d - 1);
      if (parent.type !== BULLET_LIST) return null;
      return {
        itemPos: $pos.before(d),
        parent,
        parentPos: $pos.before(d - 1) + 1,
        index: $pos.index(d - 1),
      };
    }
  }
  return null;
}

/**
 * Absolute position of the child at `index` within a parent whose content
 * starts at `parentStart`.
 */
export function childPosAt(parent: Node, parentStart: number, index: number): number {
  let pos = parentStart;
  for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
  return pos;
}

/**
 * Absolute position of the sibling list_item adjacent to `itemPos` in
 * `direction`, within the same parent bullet_list, or null when no such sibling
 * exists (boundary, or `itemPos` is not directly inside a bullet_list).
 */
export function adjacentItemPos(doc: Node, itemPos: number, direction: -1 | 1): number | null {
  try {
    const $pos = doc.resolve(itemPos);
    const parent = $pos.parent;
    if (parent.type !== BULLET_LIST) return null;
    const target = $pos.index() + direction;
    if (target < 0 || target >= parent.childCount) return null;
    return childPosAt(parent, $pos.start(), target);
  } catch {
    return null;
  }
}
