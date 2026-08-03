import { Fragment, type Node } from 'prosemirror-model';
import { type Command } from 'prosemirror-state';
import { LIST_ITEM } from '../model/nodes';
import { findListItemDepth } from '../model/position';
import {
  collectAllSelectedItemPositions,
  createNodeRangeSelection,
  isNodeRangeSelection,
} from '../selections/nodeRangeSelection';
import { rangeAware } from './rangeAware';

// Duplicate every selected list_item (primary range + additionalItems) and
// insert the copies right after the rearmost selected item, all sharing the
// rearmost's parent bullet_list. Selection is updated to cover the new copies.
const duplicateNodeRange: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const positions = collectAllSelectedItemPositions(sel);
  if (positions.length === 0) return false;

  const nodes: Node[] = [];
  for (const pos of positions) {
    const node = state.doc.nodeAt(pos);
    if (!node || node.type !== LIST_ITEM) continue;
    nodes.push(node.copy(node.content));
  }
  if (nodes.length === 0) return false;

  const rearmostPos = positions[positions.length - 1];
  const rearmostNode = state.doc.nodeAt(rearmostPos)!;
  const insertPos = rearmostPos + rearmostNode.nodeSize;

  const tr = state.tr.insert(insertPos, Fragment.fromArray(nodes));

  const itemsSize = nodes.reduce((s, n) => s + n.nodeSize, 0);
  const lastSize = nodes[nodes.length - 1].nodeSize;
  const anchorPos = insertPos;
  const headPos = insertPos + itemsSize - lastSize;
  const newSel = createNodeRangeSelection(tr.doc, anchorPos, headPos);
  if (newSel) tr.setSelection(newSel);

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

const duplicateSingle: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const depth = findListItemDepth($from);
  if (depth === null) return false;
  const item = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, item.copy(item.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

export const duplicateItem = rangeAware(duplicateNodeRange, duplicateSingle);
