import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isNodeRangeSelection } from '../selections/node-range-selection';

export const rangeSelectionDecorations = new Plugin({
  key: new PluginKey('nfp-range-selection-decorations'),
  props: {
    decorations(state) {
      const sel = state.selection;
      if (!isNodeRangeSelection(sel)) return DecorationSet.empty;
      const decorations: Decoration[] = [];
      sel.forEachItem((pos, node) => {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { 'data-range-selected': 'true' }),
        );
      });
      return DecorationSet.create(state.doc, decorations);
    },
  },
});
