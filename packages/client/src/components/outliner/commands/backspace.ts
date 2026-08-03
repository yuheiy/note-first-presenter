import type { Node } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import { type Command, TextSelection } from 'prosemirror-state';
import { BULLET_LIST, LIST_ITEM, PARAGRAPH } from '../model/nodes';
import { findListItemDepth, paragraphEndOf } from '../model/position';
import {
  collectAllSelectedItemPositions,
  isNodeRangeSelection,
} from '../selections/nodeRangeSelection';
import { cleanupAfterBulkDelete } from './cleanup';
import { rangeAware } from './rangeAware';

function isItemEmpty(item: Node): boolean {
  return (
    item.childCount === 1 &&
    item.firstChild!.type === PARAGRAPH &&
    item.firstChild!.content.size === 0
  );
}

const deleteRange: Command = (state, dispatch) => {
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

  cleanupAfterBulkDelete(tr);

  // Place caret near the front-most originally selected position, clamped into
  // the shrunken doc. After the dust settles a paragraph should be nearby.
  const caretPos = Math.min(...positions);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, caretPos))));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

// Backspace at the start of a list_item.
// - empty item with no preceding sibling → fall back to default (no-op for top-level only item)
// - empty item with a preceding sibling   → delete it, caret to end of previous paragraph
// - non-empty item, first sibling         → liftListItem (outdent)
// - non-empty item, has previous sibling  → merge paragraph text into the previous item
const singleBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === PARAGRAPH;
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
    const caret = paragraphEndOf(state.doc, prevItemStart)!;
    const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, caret));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }

  if (indexInList === 0) {
    return liftListItem(LIST_ITEM)(state, dispatch);
  }

  // Note: nested children of current item are dropped — a known limitation
  // matching basic Workflowy behaviour for merge across non-empty leaves.
  const prevItem = parentList.child(indexInList - 1);
  const prevItemStart = itemStart - prevItem.nodeSize;
  const insertPos = paragraphEndOf(state.doc, prevItemStart)!;
  const currentParaContent = item.firstChild!.content;

  const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
  tr.insert(insertPos, currentParaContent);
  tr.setSelection(TextSelection.create(tr.doc, insertPos));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

// Delete at the end of a paragraph: pull the next sibling's content into the current item.
const singleDelete: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === PARAGRAPH;
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

export const smartBackspace = rangeAware(deleteRange, singleBackspace);
export const smartDelete = rangeAware(deleteRange, singleDelete);
