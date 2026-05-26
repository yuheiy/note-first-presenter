import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

function moveRange(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    if (sel.parentList.type !== BULLET_LIST) return false;
    const targetIndex = direction === -1 ? sel.fromIndex - 1 : sel.toIndex + 1;
    if (targetIndex < 0 || targetIndex >= sel.parentList.childCount) return false;

    const sibling = sel.parentList.child(targetIndex);
    const items: Node[] = [];
    sel.forEachItem((_p, n) => items.push(n));

    const rangeStart = sel.from;
    const rangeEnd = sel.to;
    const replaceFrom = direction === -1 ? rangeStart - sibling.nodeSize : rangeStart;
    const replaceTo = direction === -1 ? rangeEnd : rangeEnd + sibling.nodeSize;
    const replacement = direction === -1 ? [...items, sibling] : [sibling, ...items];

    const tr = state.tr.replaceWith(replaceFrom, replaceTo, Fragment.fromArray(replacement));

    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const newRangeStart = direction === -1 ? replaceFrom : replaceFrom + sibling.nodeSize;
    const lastSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const anchorPos = forward ? newRangeStart : newRangeStart + itemsSize - lastSize;
    const headPos = forward ? newRangeStart + itemsSize - lastSize : newRangeStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function moveSingle(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findListItemDepth($from);
    if (depth === null) return false;
    const item = $from.node(depth);
    const parentList = $from.node(depth - 1);
    if (parentList.type !== BULLET_LIST) return false;
    const indexInList = $from.index(depth - 1);
    const targetIndex = indexInList + direction;
    if (targetIndex < 0 || targetIndex >= parentList.childCount) return false;
    const sibling = parentList.child(targetIndex);

    const itemStart = $from.before(depth);
    const siblingStart =
      direction === -1 ? itemStart - sibling.nodeSize : itemStart + item.nodeSize;
    const rangeStart = Math.min(itemStart, siblingStart);
    const rangeEnd = rangeStart + item.nodeSize + sibling.nodeSize;
    const replacement = direction === -1 ? [item, sibling] : [sibling, item];

    const tr = state.tr.replaceWith(rangeStart, rangeEnd, Fragment.fromArray(replacement));
    const caretOffset = $from.pos - itemStart;
    const newItemStart = direction === -1 ? rangeStart : rangeStart + sibling.nodeSize;
    try {
      tr.setSelection(TextSelection.near(tr.doc.resolve(newItemStart + caretOffset)));
    } catch {
      // caret remap best-effort; ignore if pos invalid
    }
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function move(direction: -1 | 1): Command {
  return (state, dispatch) => {
    if (isNodeRangeSelection(state.selection)) return moveRange(direction)(state, dispatch);
    return moveSingle(direction)(state, dispatch);
  };
}

export const moveItemUp = move(-1);
export const moveItemDown = move(1);
