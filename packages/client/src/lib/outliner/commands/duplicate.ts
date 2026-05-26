import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

export const duplicateItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (isNodeRangeSelection(sel)) {
    const items: Node[] = [];
    sel.forEachItem((_p, n) => items.push(n.copy(n.content)));
    const insertPos = sel.to;
    const tr = state.tr.insert(insertPos, Fragment.fromArray(items));
    const newStart = insertPos;
    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const lastSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const anchorPos = forward ? newStart : newStart + itemsSize - lastSize;
    const headPos = forward ? newStart + itemsSize - lastSize : newStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }

  const { $from } = sel;
  const depth = findListItemDepth($from);
  if (depth === null) return false;
  const item = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, item.copy(item.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
