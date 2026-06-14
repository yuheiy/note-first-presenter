import type { EditorState } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { findActiveGroup } from '../active-slide';

const key = new PluginKey('nfp-active-slide-decorations');

function buildDecorations(state: EditorState): DecorationSet {
  const group = findActiveGroup(state.doc, state.selection);
  const decorations: Decoration[] = [];
  for (const pos of group.itemPositions) {
    const node = state.doc.nodeAt(pos);
    if (!node) continue;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-active-slide': 'true' }));
  }
  return DecorationSet.create(state.doc, decorations);
}

/**
 * Marks the top-level items that belong to the active slide with
 * `data-active-slide="true"` so the left-edge accent bar can highlight them.
 * Uses plugin state so decorations are only rebuilt when the document or
 * selection changes, not on every transaction.
 */
export const activeSlideDecorations = new Plugin({
  key,
  state: {
    init(_, state) {
      return buildDecorations(state);
    },
    apply(tr, old, _, newState) {
      if (!tr.docChanged && !tr.selectionSet) return old;
      return buildDecorations(newState);
    },
  },
  props: {
    decorations(state) {
      return key.getState(state);
    },
  },
});
