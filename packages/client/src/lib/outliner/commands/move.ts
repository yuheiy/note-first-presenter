import { Fragment, type ResolvedPos } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  return depth === 0 ? null : depth;
}

function move(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findListItemDepth($from);
    if (depth === null) return false;
    const item = $from.node(depth);
    const parentList = $from.node(depth - 1);
    if (parentList.type !== outlinerSchema.nodes.bullet_list) return false;
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

export const moveItemUp = move(-1);
export const moveItemDown = move(1);
