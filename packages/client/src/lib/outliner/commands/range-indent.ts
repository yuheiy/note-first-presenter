import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { type Command, TextSelection } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

function withTextSelectionOverRange(state: Parameters<Command>[0]): Parameters<Command>[0] {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return state;
  // Build a TextSelection spanning first item paragraph start → last item paragraph end.
  const list = sel.parentList;
  let pos = sel.parentListPos;
  for (let i = 0; i < sel.fromIndex; i++) pos += list.child(i).nodeSize;
  const fromTextPos = pos + 2; // inside first item's paragraph
  let lastPos = pos;
  for (let i = sel.fromIndex; i <= sel.toIndex; i++) lastPos += list.child(i).nodeSize;
  const lastItem = list.child(sel.toIndex);
  const lastPara = lastItem.firstChild!;
  // position at end of last item's paragraph
  const lastParaEnd = lastPos - lastItem.nodeSize + 2 + lastPara.content.size;
  const $from = state.doc.resolve(fromTextPos);
  const $to = state.doc.resolve(lastParaEnd);
  return state.apply(state.tr.setSelection(TextSelection.between($from, $to)));
}

export const rangeAwareSinkListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return sinkListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};

export const rangeAwareLiftListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return liftListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};
