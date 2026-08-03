import { type Command, TextSelection } from 'prosemirror-state';
import { emptyListItem } from '../model/nodes';
import { paragraphStartOf } from '../model/position';
import { isNodeRangeSelection } from '../selections/nodeRangeSelection';

// Acts on the contiguous primary range only: additionalItems from a
// Cmd/Ctrl+Click selection are left standing while the primary range is
// replaced.
export const rangeAwareSplitListItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const tr = state.tr.replaceWith(sel.from, sel.to, emptyListItem());
  tr.setSelection(TextSelection.create(tr.doc, paragraphStartOf(sel.from)));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
