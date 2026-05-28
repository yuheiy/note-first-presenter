import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command, type EditorState } from 'prosemirror-state';
import {
  collectAllSelectedItemPositions,
  createNodeRangeSelection,
  isNodeRangeSelection,
} from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

// Duplicate every selected list_item (primary range + additionalItems) and
// insert the copies right after the rearmost selected item, all sharing the
// rearmost's parent bullet_list. Selection is updated to cover the new copies.
function duplicateNodeRange(state: EditorState, dispatch: Parameters<Command>[1]): boolean {
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
}

export const duplicateItem: Command = (state, dispatch) => {
  if (isNodeRangeSelection(state.selection)) return duplicateNodeRange(state, dispatch);

  const { $from } = state.selection;
  const depth = findListItemDepth($from);
  if (depth === null) return false;
  const item = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, item.copy(item.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
