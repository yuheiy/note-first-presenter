import { type Command, type Transaction } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function setCollapsed(value: boolean): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (isNodeRangeSelection(sel)) {
      let tr: Transaction | null = null;
      sel.forEachItem((pos, node) => {
        const hasChildList = node.lastChild?.type === BULLET_LIST;
        if (!hasChildList) return;
        if (!tr) tr = state.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
      });
      if (!tr) return false;
      if (dispatch) dispatch(tr);
      return true;
    }

    const { $from } = sel;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type !== LIST_ITEM) depth--;
    if (depth === 0) return false;
    const pos = $from.before(depth);
    const node = $from.node(depth);
    const hasChildList = node.lastChild?.type === BULLET_LIST;
    if (!hasChildList) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    if (dispatch) dispatch(tr);
    return true;
  };
}

export const collapseItem = setCollapsed(true);
export const expandItem = setCollapsed(false);
