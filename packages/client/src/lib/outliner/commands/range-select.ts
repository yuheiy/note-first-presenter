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

type Dispatch = Parameters<Command>[1];

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
// The promoted selection records a new layer on the liftedFrom chain so the
// opposite direction can later peel back to the original.
function promoteOnBoundary(state: EditorState, direction: -1 | 1): NodeRangeSelection | null {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return null;
  const $anchor = sel.$anchor;
  const parentDepth = sel.parentDepth;
  if (parentDepth < 2) return null;

  const lifted: LiftedFrom = {
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
    return new NodeRangeSelection($pos, $pos, lifted);
  }

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
      return new NodeRangeSelection($pos, $pos, lifted);
    }
    depth -= 2;
  }
  return null;
}

// On a single-item lifted selection, the opposite direction peels one
// promotion layer at a time. Returns true if handled.
function tryPeelLiftedFrom(state: EditorState, direction: -1 | 1, dispatch: Dispatch): boolean {
  const sel = state.selection;
  if (
    !isNodeRangeSelection(sel) ||
    !sel.liftedFrom ||
    sel.itemCount !== 1 ||
    sel.liftedFrom.fromDirection !== -direction
  ) {
    return false;
  }
  const restored = restoreLifted(state, sel.liftedFrom);
  if (!restored) return false;
  if (dispatch) dispatch(state.tr.setSelection(restored).scrollIntoView());
  return true;
}

// For a TextSelection whose head is not yet at the paragraph edge in the
// direction of travel, extend (or shrink) the selection to that edge so the
// browser's default Shift+Arrow can't push the head into the next item.
// Returns true if it handled the press, false to let the rest of extend()
// continue (i.e., the head is already at the edge — time to enter range mode).
function tryExtendTextSelectionToEdge(
  state: EditorState,
  direction: -1 | 1,
  dispatch: Dispatch,
): boolean {
  const sel = state.selection;
  if (!(sel instanceof TextSelection)) return false;
  if (sel.$head.parent.type !== outlinerSchema.nodes.paragraph) return false;
  const ancestor = findListItemAncestor(sel.$head);
  if (!ancestor) return false;

  const atStart = sel.$head.parentOffset === 0;
  const atEnd = sel.$head.parentOffset === sel.$head.parent.content.size;
  if (direction === -1 && atStart) return false;
  if (direction === 1 && atEnd) return false;

  const paragraphInner = ancestor.itemPos + 2;
  const headPos =
    direction === -1 ? paragraphInner : paragraphInner + sel.$head.parent.content.size;
  const next = TextSelection.create(state.doc, sel.$anchor.pos, headPos);
  if (dispatch) dispatch(state.tr.setSelection(next).scrollIntoView());
  return true;
}

interface ExtendContext {
  parent: Node;
  parentStart: number;
  anchorIndex: number;
  headIndex: number;
  // True when this press transitioned a TextSelection into range mode rather
  // than moving the head; we shouldn't try to advance further this press.
  firstPress: boolean;
}

function resolveExtendContext(state: EditorState): ExtendContext | null {
  const sel = state.selection;

  if (isNodeRangeSelection(sel)) {
    return {
      parent: sel.parentList,
      parentStart: sel.parentListPos,
      anchorIndex: sel.anchorIndex,
      headIndex: sel.headIndex,
      firstPress: false,
    };
  }

  if (sel instanceof NodeSelection && sel.node.type === LIST_ITEM) {
    const $pos = sel.$from;
    if ($pos.parent.type !== BULLET_LIST) return null;
    const index = $pos.index();
    return {
      parent: $pos.parent,
      parentStart: $pos.start(),
      anchorIndex: index,
      headIndex: index,
      firstPress: false,
    };
  }

  if (sel instanceof TextSelection) {
    const ancestor = findListItemAncestor(sel.$head);
    if (!ancestor) return null;
    return {
      parent: ancestor.parent,
      parentStart: ancestor.parentPos,
      anchorIndex: ancestor.index,
      headIndex: ancestor.index,
      firstPress: true,
    };
  }

  return null;
}

// Build the new NodeRangeSelection by moving the head one step in `direction`,
// keeping the anchor in place. Returns true if dispatched, false if the
// caller should fall back to promote / no-op.
function tryAdvanceHead(
  state: EditorState,
  ctx: ExtendContext,
  direction: -1 | 1,
  dispatch: Dispatch,
): boolean {
  if (ctx.firstPress) return false;
  const nextHead = ctx.headIndex + direction;
  if (nextHead < 0 || nextHead >= ctx.parent.childCount) return false;
  if (ctx.parent.child(nextHead).type !== LIST_ITEM) return false;

  const anchorPos = siblingItemPos(ctx.parent, ctx.parentStart, ctx.anchorIndex);
  const headPos = siblingItemPos(ctx.parent, ctx.parentStart, nextHead);
  // Preserve any lifted-from chain so the opposite direction can still peel.
  const lifted = isNodeRangeSelection(state.selection) ? state.selection.liftedFrom : null;
  const sel = new NodeRangeSelection(
    state.doc.resolve(anchorPos),
    state.doc.resolve(headPos),
    lifted,
  );
  if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
  return true;
}

// firstPress means "TextSelection just collapsed into a single-item range":
// dispatch that range without moving the head.
function dispatchFirstPress(state: EditorState, ctx: ExtendContext, dispatch: Dispatch): boolean {
  const pos = siblingItemPos(ctx.parent, ctx.parentStart, ctx.anchorIndex);
  const $pos = state.doc.resolve(pos);
  const sel = new NodeRangeSelection($pos, $pos, null);
  if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
  return true;
}

function extend(direction: -1 | 1): Command {
  return (state, dispatch) => {
    // 1. Reverse direction on a single-item promoted selection → peel.
    if (tryPeelLiftedFrom(state, direction, dispatch)) return true;

    // 2. TextSelection not yet at the paragraph edge → extend to the edge.
    if (tryExtendTextSelectionToEdge(state, direction, dispatch)) return true;

    // 3. Resolve where the range will live.
    const ctx = resolveExtendContext(state);
    if (!ctx) return false;

    // 4a. First press from a TextSelection at the paragraph edge: enter
    //     range mode on the current item without moving.
    if (ctx.firstPress) return dispatchFirstPress(state, ctx, dispatch);

    // 4b. Advance the head one item in `direction` if possible.
    if (tryAdvanceHead(state, ctx, direction, dispatch)) return true;

    // 5. At the bullet_list boundary — try promoting one level out.
    const promoted = promoteOnBoundary(state, direction);
    if (promoted) {
      if (dispatch) dispatch(state.tr.setSelection(promoted).scrollIntoView());
      return true;
    }

    // 6. Outermost boundary, no further promotion: consume the key on an
    //    item selection so the browser default doesn't disturb the highlight.
    const sel = state.selection;
    if (isNodeRangeSelection(sel) || sel instanceof NodeSelection) return true;
    return false;
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
