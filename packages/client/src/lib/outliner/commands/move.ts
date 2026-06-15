import { Fragment, type Node } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import {
  collectAllSelectedItemPositions,
  createNodeRangeSelection,
  isNodeRangeSelection,
} from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';
import { adjacentItemPos, findItemDepth } from '../tree';
import { cleanupEmptyBulletLists } from './_cleanup';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

// Move every selected list_item (primary + additionalItems) by one slot at
// the rearmost (direction=1) / frontmost (direction=-1) item's level. Moved
// items become contiguous at the destination, sharing the anchor item's
// parent bullet_list. Returns false if no movement is possible.
function moveNodeRange(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    const positions = collectAllSelectedItemPositions(sel);
    if (positions.length === 0) return false;

    const anchorPos = direction === 1 ? positions[positions.length - 1] : positions[0];
    const siblingPos = adjacentItemPos(state.doc, anchorPos, direction);
    if (siblingPos === null) return false;
    const siblingNode = state.doc.nodeAt(siblingPos);
    if (!siblingNode || siblingNode.type !== LIST_ITEM) return false;

    // Insertion target in the ORIGINAL doc: just after the sibling (down) or
    // at the sibling's position (up). We map this through the transaction's
    // mapping after deletions / cleanup to find where it lives in the new doc.
    const insertPosOrig = direction === 1 ? siblingPos + siblingNode.nodeSize : siblingPos;

    const items: Node[] = [];
    for (const pos of positions) {
      const node = state.doc.nodeAt(pos);
      if (!node || node.type !== LIST_ITEM) continue;
      items.push(node);
    }
    if (items.length === 0) return false;

    let tr = state.tr;
    // Delete back-to-front so each delete uses still-valid original positions.
    const sortedDescending = positions.slice().sort((a, b) => b - a);
    for (const pos of sortedDescending) {
      const node = tr.doc.nodeAt(tr.mapping.map(pos, -1));
      if (!node || node.type !== LIST_ITEM) continue;
      const from = tr.mapping.map(pos);
      tr = tr.delete(from, from + node.nodeSize);
    }

    // Drop any bullet_list nodes that became empty from the deletes, then
    // translate the original insert position through everything.
    cleanupEmptyBulletLists(tr);
    const insertPos = tr.mapping.map(insertPosOrig);

    tr = tr.insert(insertPos, Fragment.fromArray(items));

    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const lastSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const newAnchor = forward ? insertPos : insertPos + itemsSize - lastSize;
    const newHead = forward ? insertPos + itemsSize - lastSize : insertPos;
    const newSel = createNodeRangeSelection(tr.doc, newAnchor, newHead);
    if (newSel) {
      tr.setSelection(newSel);
    } else {
      try {
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos)));
      } catch {
        /* best effort */
      }
    }

    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function moveSingle(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findItemDepth($from);
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
    if (isNodeRangeSelection(state.selection)) return moveNodeRange(direction)(state, dispatch);
    return moveSingle(direction)(state, dispatch);
  };
}

export const moveItemUp = move(-1);
export const moveItemDown = move(1);
