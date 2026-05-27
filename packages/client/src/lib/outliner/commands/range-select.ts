import { type Node } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { findListItemAncestor } from '../plugins/text-selection-clamp';
import {
  isNodeRangeSelection,
  type LiftedFrom,
  NodeRangeSelection,
} from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function listItemNodeSelection(sel: NodeSelection): boolean {
  return sel.node.type === LIST_ITEM;
}

function siblingItemPos(parent: Node, parentStart: number, index: number): number {
  let pos = parentStart;
  for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
  return pos;
}

function restoreLifted(state: EditorState, lifted: LiftedFrom): NodeRangeSelection | null {
  try {
    const $a = state.doc.resolve(lifted.anchor);
    const $h = state.doc.resolve(lifted.head);
    if ($a.depth !== $h.depth) return null;
    const parent = $a.node($a.depth);
    if (parent.type !== BULLET_LIST) return null;
    if (parent !== $h.node($h.depth)) return null;
    // Peel one layer of the lift chain: the restored selection carries any
    // remaining ancestors so the user can keep going in the reverse direction.
    return new NodeRangeSelection($a, $h, lifted.previous);
  } catch {
    return null;
  }
}

// When a NodeRangeSelection hits the boundary of its bullet_list, promote it
// one level out:
// - Up (direction = -1): select the immediate ancestor list_item one level up.
// - Down (direction = 1): walk up ancestor bullet_lists until we find an
//   ancestor that has a next sibling at that level, and select it.
// The original (deepest) selection before any promotion is preserved in
// `liftedFrom` so that pressing the opposite direction restores it in one
// step, regardless of how many levels we walked up.
function promoteOnBoundary(state: EditorState, direction: -1 | 1): NodeRangeSelection | null {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return null;
  const $anchor = sel.$anchor;
  const parentDepth = sel.parentDepth;
  if (parentDepth < 2) return null;

  // Each promotion pushes a new layer onto the lift chain so that pressing
  // the opposite direction later can peel back one step at a time.
  const liftedWithDir: LiftedFrom = {
    anchor: sel.$anchor.pos,
    head: sel.$head.pos,
    fromDirection: direction,
    previous: sel.liftedFrom,
  };

  if (direction === -1) {
    const outerListItem = $anchor.node(parentDepth - 1);
    if (outerListItem.type !== LIST_ITEM) return null;
    const outerBulletList = $anchor.node(parentDepth - 2);
    if (outerBulletList.type !== BULLET_LIST) return null;
    const outerItemPos = $anchor.before(parentDepth - 1);
    const $pos = state.doc.resolve(outerItemPos);
    return new NodeRangeSelection($pos, $pos, liftedWithDir);
  }

  // Down: walk up ancestor bullet_lists until we find one whose containing
  // list_item has a next sibling.
  let depth = parentDepth;
  while (depth >= 2) {
    const outerListItem = $anchor.node(depth - 1);
    if (outerListItem.type !== LIST_ITEM) break;
    const outerBulletList = $anchor.node(depth - 2);
    if (outerBulletList.type !== BULLET_LIST) break;

    const outerIndex = $anchor.index(depth - 2);
    const outerStart = $anchor.start(depth - 2);
    const nextIndex = outerIndex + 1;
    if (
      nextIndex < outerBulletList.childCount &&
      outerBulletList.child(nextIndex).type === LIST_ITEM
    ) {
      const nextItemPos = siblingItemPos(outerBulletList, outerStart, nextIndex);
      const $pos = state.doc.resolve(nextItemPos);
      return new NodeRangeSelection($pos, $pos, liftedWithDir);
    }
    depth -= 2;
  }
  return null;
}

function extend(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { selection, doc } = state;

    // On a single-item lifted selection, the opposite direction peels one
    // promotion layer at a time. Multi-item selections fall through so the
    // regular extend logic shrinks the head toward the anchor by one item.
    if (
      isNodeRangeSelection(selection) &&
      selection.liftedFrom &&
      selection.itemCount === 1 &&
      selection.liftedFrom.fromDirection === -direction
    ) {
      const restored = restoreLifted(state, selection.liftedFrom);
      if (restored) {
        if (dispatch) dispatch(state.tr.setSelection(restored).scrollIntoView());
        return true;
      }
    }

    let anchorIndex: number;
    let headIndex: number;
    let parent: Node;
    let parentStart: number;
    let firstPress = false;

    if (isNodeRangeSelection(selection)) {
      parent = selection.parentList;
      parentStart = selection.parentListPos;
      anchorIndex = selection.anchorIndex;
      headIndex = selection.headIndex;
    } else if (selection instanceof NodeSelection && listItemNodeSelection(selection)) {
      const $pos = selection.$from;
      parent = $pos.parent;
      if (parent.type !== BULLET_LIST) return false;
      parentStart = $pos.start();
      anchorIndex = $pos.index();
      headIndex = anchorIndex;
    } else if (selection instanceof TextSelection) {
      const $head = selection.$head;
      if ($head.parent.type !== outlinerSchema.nodes.paragraph) return false;
      const ancestor = findListItemAncestor($head);
      if (!ancestor) return false;
      const atStart = $head.parentOffset === 0;
      const atEnd = $head.parentOffset === $head.parent.content.size;

      if (direction === -1 && !atStart) {
        const paragraphStart = ancestor.itemPos + 2;
        const next = TextSelection.create(doc, selection.$anchor.pos, paragraphStart);
        if (dispatch) dispatch(state.tr.setSelection(next).scrollIntoView());
        return true;
      }
      if (direction === 1 && !atEnd) {
        const paragraphEnd = ancestor.itemPos + 2 + $head.parent.content.size;
        const next = TextSelection.create(doc, selection.$anchor.pos, paragraphEnd);
        if (dispatch) dispatch(state.tr.setSelection(next).scrollIntoView());
        return true;
      }

      parent = ancestor.parent;
      parentStart = ancestor.parentPos;
      const localIndex = ancestor.itemPos - parentStart;
      let cumulative = 0;
      let index = -1;
      for (let i = 0; i < parent.childCount; i++) {
        if (cumulative === localIndex) {
          index = i;
          break;
        }
        cumulative += parent.child(i).nodeSize;
      }
      if (index < 0) return false;
      anchorIndex = index;
      headIndex = index;
      firstPress = true;
    } else {
      return false;
    }

    const nextHead = firstPress ? headIndex : headIndex + direction;
    if (nextHead < 0 || nextHead >= parent.childCount) {
      if (firstPress) return false;
      const promoted = promoteOnBoundary(state, direction);
      if (promoted) {
        if (dispatch) dispatch(state.tr.setSelection(promoted).scrollIntoView());
        return true;
      }
      // At the outermost boundary with no further promotion possible: consume
      // the key so the browser's default Shift+Arrow does not move the caret
      // or otherwise disturb the visual selection. The selection stays put.
      if (isNodeRangeSelection(selection) || selection instanceof NodeSelection) {
        return true;
      }
      return false;
    }
    if (parent.child(nextHead).type !== LIST_ITEM) return false;

    const anchorPos = siblingItemPos(parent, parentStart, anchorIndex);
    const headPos = siblingItemPos(parent, parentStart, nextHead);
    // Preserve the lifted-from snapshot so the opposite direction can still
    // restore it after the user keeps extending in the current direction.
    const lifted = isNodeRangeSelection(selection) ? selection.liftedFrom : null;
    const sel = new NodeRangeSelection(doc.resolve(anchorPos), doc.resolve(headPos), lifted);
    if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
    return true;
  };
}

export const extendRangeSelectionUp = extend(-1);
export const extendRangeSelectionDown = extend(1);

export const exitRangeSelection: Command = (state, dispatch) => {
  const { selection } = state;
  if (!isNodeRangeSelection(selection) && !(selection instanceof NodeSelection)) return false;
  if (selection instanceof NodeSelection && selection.node.type !== LIST_ITEM) return false;

  const firstItemPos = isNodeRangeSelection(selection)
    ? selection.from
    : (selection as NodeSelection).from;
  const item = state.doc.nodeAt(firstItemPos);
  if (!item) return false;
  const paragraph = item.firstChild;
  if (!paragraph) return false;
  const caret = firstItemPos + 2 + paragraph.content.size;
  if (dispatch) {
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, caret)).scrollIntoView());
  }
  return true;
};
