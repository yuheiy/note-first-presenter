import { type Command, TextSelection } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

export const rangeAwareSplitListItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const empty = outlinerSchema.node('list_item', null, [
    outlinerSchema.node('paragraph', null, []),
  ]);
  const tr = state.tr.replaceWith(sel.from, sel.to, empty);
  // caret inside the new empty paragraph
  const caret = sel.from + 2;
  tr.setSelection(TextSelection.create(tr.doc, caret));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
