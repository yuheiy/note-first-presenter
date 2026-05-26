import { type Node } from 'prosemirror-model';
import { type Command, NodeSelection, TextSelection } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
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

function extend(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { selection, doc } = state;
    let anchorIndex: number;
    let headIndex: number;
    let parent: Node;
    let parentStart: number;

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
    } else {
      return false;
    }

    const nextHead = headIndex + direction;
    if (nextHead < 0 || nextHead >= parent.childCount) return false;
    if (parent.child(nextHead).type !== LIST_ITEM) return false;

    const anchorPos = siblingItemPos(parent, parentStart, anchorIndex);
    const headPos = siblingItemPos(parent, parentStart, nextHead);
    const sel = new NodeRangeSelection(doc.resolve(anchorPos), doc.resolve(headPos));
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
