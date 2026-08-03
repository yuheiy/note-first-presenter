import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { type Command, TextSelection } from 'prosemirror-state';
import { LIST_ITEM } from '../model/nodes';
import {
  paragraphEndOf,
  paragraphStartOf,
  SKIP_TEXT_SELECTION_CLAMP_META,
} from '../model/position';
import { isNodeRangeSelection } from '../selections/nodeRangeSelection';

// Acts on the contiguous primary range only: additionalItems from a
// Cmd/Ctrl+Click selection are not part of the synthetic TextSelection below,
// so a non-contiguous selection indents just its primary range.
function withTextSelectionOverRange(state: Parameters<Command>[0]): Parameters<Command>[0] {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return state;
  // Build a TextSelection spanning first item paragraph start → last item paragraph end.
  const lastItem = sel.parentList.child(sel.toIndex);
  const lastItemPos = sel.to - lastItem.nodeSize;
  const $from = state.doc.resolve(paragraphStartOf(sel.from));
  const $to = state.doc.resolve(paragraphEndOf(state.doc, lastItemPos)!);
  // Tag the synthetic TextSelection so textSelectionClamp doesn't snap it
  // back to the anchor item — the cross-item span is intentional here.
  const tr = state.tr
    .setSelection(TextSelection.between($from, $to))
    .setMeta(SKIP_TEXT_SELECTION_CLAMP_META, true);
  return state.apply(tr);
}

export const rangeAwareSinkListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return sinkListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};

export const rangeAwareLiftListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return liftListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};
