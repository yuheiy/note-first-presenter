import { NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

// Clicks landing on the list_item element itself (e.g., on the bullet/marker
// area outside the paragraph text) select the whole list_item as a NodeSelection.
// This lets the user cut/copy/move/delete an entire bullet without the keyboard.
export const bulletClickPlugin = new Plugin({
  key: new PluginKey('nfp-bullet-click'),
  props: {
    handleClickOn(view, pos, node, nodePos, event, direct) {
      if (!direct) return false;
      if (node.type !== outlinerSchema.nodes.list_item) return false;
      // Ignore if the click target is inside the paragraph (text editing).
      const target = event.target as Element | null;
      if (target?.closest('p')) return false;
      const sel = NodeSelection.create(view.state.doc, nodePos);
      view.dispatch(view.state.tr.setSelection(sel));
      return true;
    },
  },
});
