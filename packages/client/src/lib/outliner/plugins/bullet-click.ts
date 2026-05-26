import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Selection,
} from 'prosemirror-state';
import { createNodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

export function resolveBulletClickSelection(
  state: EditorState,
  itemPos: number,
  shift: boolean,
): Selection {
  const single = NodeSelection.create(state.doc, itemPos);
  if (!shift) return single;

  const current = state.selection;
  let anchorItemPos: number | null = null;
  if (isNodeRangeSelection(current)) {
    anchorItemPos = current.from + 0; // first item position
    // Use the anchor side of the range as the anchor; preserve direction.
    anchorItemPos =
      current.anchorIndex <= current.headIndex
        ? current.from
        : current.to - current.parentList.child(current.toIndex).nodeSize;
  } else if (current instanceof NodeSelection && current.node.type === LIST_ITEM) {
    anchorItemPos = current.from;
  }
  if (anchorItemPos === null) return single;

  const range = createNodeRangeSelection(state.doc, anchorItemPos, itemPos);
  return range ?? single;
}

export const bulletClickPlugin = new Plugin({
  key: new PluginKey('nfp-bullet-click'),
  props: {
    handleClickOn(view, _pos, node, nodePos, event, direct) {
      if (!direct) return false;
      if (node.type !== LIST_ITEM) return false;
      const target = event.target as Element | null;
      if (target?.closest('p')) return false;
      const sel = resolveBulletClickSelection(view.state, nodePos, event.shiftKey);
      view.dispatch(view.state.tr.setSelection(sel));
      return true;
    },
  },
});
