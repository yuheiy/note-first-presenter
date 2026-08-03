import type { EditorState } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { findActiveGroup } from '../noteGroups';

const key = new PluginKey('nfp-active-slide-decorations');

/**
 * The active slide's top-level items, as node decorations. Exported so tests
 * can assert on the set without reaching into plugin props.
 */
export function buildActiveSlideDecorations(state: EditorState): DecorationSet {
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
      return buildActiveSlideDecorations(state);
    },
    apply(tr, old, _, newState) {
      if (!tr.docChanged && !tr.selectionSet) return old;
      return buildActiveSlideDecorations(newState);
    },
  },
  props: {
    decorations(state) {
      return key.getState(state);
    },
  },
});
