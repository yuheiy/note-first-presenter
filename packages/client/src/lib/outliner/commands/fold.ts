import type { Command } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

function setCollapsed(value: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
    if (depth === 0) return false;
    const pos = $from.before(depth);
    const node = $from.node(depth);
    const hasChildList = node.lastChild?.type === outlinerSchema.nodes.bullet_list;
    if (!hasChildList) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    if (dispatch) dispatch(tr);
    return true;
  };
}

export const collapseItem = setCollapsed(true);
export const expandItem = setCollapsed(false);
