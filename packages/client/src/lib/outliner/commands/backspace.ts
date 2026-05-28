import type { Node, ResolvedPos } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import {
  collectAllSelectedItemPositions,
  isNodeRangeSelection,
} from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';
import { cleanupEmptyBulletLists } from './_cleanup';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

function isItemEmpty(item: Node): boolean {
  return (
    item.childCount === 1 &&
    item.firstChild!.type === outlinerSchema.nodes.paragraph &&
    item.firstChild!.content.size === 0
  );
}

function deleteRange(state: EditorState, dispatch: Parameters<Command>[1]): boolean {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const positions = collectAllSelectedItemPositions(sel);
  if (positions.length === 0) return false;

  // Delete back-to-front so earlier positions stay valid.
  const sorted = positions.slice().sort((a, b) => b - a);
  let tr = state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type !== LIST_ITEM) continue;
    tr = tr.delete(pos, pos + node.nodeSize);
  }

  cleanupEmptyBulletLists(tr);

  // Place caret near the front-most originally selected position. After the
  // dust settles a paragraph should be nearby.
  const caretPos = Math.min(...positions);
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, caretPos))));
  } catch {
    // best effort
  }
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

// Backspace at the start of a list_item.
// - empty item with no preceding sibling → fall back to default (no-op for top-level only item)
// - empty item with a preceding sibling   → delete it, caret to end of previous paragraph
// - non-empty item, first sibling         → liftListItem (outdent)
// - non-empty item, has previous sibling  → merge paragraph text into the previous item
export const smartBackspace: Command = (state, dispatch) => {
  if (isNodeRangeSelection(state.selection)) return deleteRange(state, dispatch);

  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === outlinerSchema.nodes.paragraph;
  if (!inParagraph || $from.parentOffset !== 0) return false;
  if (item.firstChild !== $from.parent) return false;

  const parentList = $from.node(itemDepth - 1);
  if (parentList.type !== BULLET_LIST) return false;
  const indexInList = $from.index(itemDepth - 1);
  const itemStart = $from.before(itemDepth);

  if (isItemEmpty(item)) {
    if (indexInList === 0) {
      // no peer to absorb into; cannot lift further because doc only allows bullet_list
      return false;
    }
    const prevItem = parentList.child(indexInList - 1);
    const prevItemStart = itemStart - prevItem.nodeSize;
    // caret position = end of previous paragraph (insidelist_item +1 into paragraph +content.size)
    const prevPara = prevItem.firstChild!;
    const caret = prevItemStart + 2 + prevPara.content.size;
    const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, caret));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }

  if (indexInList === 0) {
    return liftListItem(LIST_ITEM)(state, dispatch);
  }

  // Merge current paragraph content into previous item's paragraph.
  // Note: nested children of current item are dropped — a known limitation
  // matching basic Workflowy behaviour for merge across non-empty leaves.
  const prevItem = parentList.child(indexInList - 1);
  const prevItemStart = itemStart - prevItem.nodeSize;
  const prevPara = prevItem.firstChild!;
  const insertPos = prevItemStart + 2 + prevPara.content.size;
  const currentParaContent = item.firstChild!.content;

  const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
  tr.insert(insertPos, currentParaContent);
  tr.setSelection(TextSelection.create(tr.doc, insertPos));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

// Delete at the end of a paragraph: pull the next sibling's content into the current item.
export const smartDelete: Command = (state, dispatch) => {
  if (isNodeRangeSelection(state.selection)) return deleteRange(state, dispatch);

  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === outlinerSchema.nodes.paragraph;
  if (!inParagraph) return false;
  if (item.lastChild !== $from.parent) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;

  const parentList = $from.node(itemDepth - 1);
  if (parentList.type !== BULLET_LIST) return false;
  const indexInList = $from.index(itemDepth - 1);
  if (indexInList >= parentList.childCount - 1) return false;

  const itemStart = $from.before(itemDepth);
  const itemEnd = itemStart + item.nodeSize;
  const nextItem = parentList.child(indexInList + 1);
  const nextParaContent = nextItem.firstChild!.content;

  const caret = $from.pos; // current caret position is preserved
  const tr = state.tr.delete(itemEnd, itemEnd + nextItem.nodeSize);
  tr.insert(caret, nextParaContent);
  tr.setSelection(TextSelection.create(tr.doc, caret));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
