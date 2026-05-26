import type { ResolvedPos } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== outlinerSchema.nodes.list_item) depth--;
  return depth === 0 ? null : depth;
}

export const duplicateItem: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const depth = findListItemDepth($from);
  if (depth === null) return false;
  const item = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, item.copy(item.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
