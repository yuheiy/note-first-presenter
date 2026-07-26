import type { Node, ResolvedPos } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

export interface ItemAncestor {
  itemPos: number;
  parent: Node;
  parentPos: number;
  /** Index of the list_item within its parent bullet_list. */
  index: number;
}

export function findListItemAncestor($pos: ResolvedPos): ItemAncestor | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) {
      const parent = $pos.node(d - 1);
      if (parent.type !== BULLET_LIST) return null;
      return {
        itemPos: $pos.before(d),
        parent,
        parentPos: $pos.before(d - 1) + 1,
        index: $pos.index(d - 1),
      };
    }
  }
  return null;
}

/**
 * Transaction meta flag that callers (e.g. `rangeAwareSinkListItem`) use to
 * tell `textSelectionClamp` that the multi-item TextSelection they just set
 * is intentional and should be left alone.
 */
export const SKIP_TEXT_SELECTION_CLAMP_META = 'nfp-skip-text-selection-clamp';

/**
 * Clamp a TextSelection whose head has crossed the boundary of the anchor's
 * list_item back to the edge of that item's paragraph. The keymap promotes
 * Shift+ArrowUp at line start and Shift+ArrowDown at line end to a
 * NodeRangeSelection explicitly; this plugin guards the remaining cases so
 * that ordinary Shift+Arrow stays within the current bullet.
 */
export const textSelectionClamp = new Plugin({
  key: new PluginKey('nfp-text-selection-clamp'),
  appendTransaction(transactions, oldState, newState) {
    if (transactions.some((tr) => tr.getMeta(SKIP_TEXT_SELECTION_CLAMP_META))) return null;
    const oldSel = oldState.selection;
    const newSel = newState.selection;
    if (!(newSel instanceof TextSelection)) return null;
    if (newSel.empty) return null;

    const anchorItem = findListItemAncestor(newSel.$anchor);
    const headItem = findListItemAncestor(newSel.$head);
    if (!anchorItem || !headItem) return null;
    if (anchorItem.itemPos === headItem.itemPos) return null;
    // Only intervene when the anchor itself stayed put (i.e., user is
    // extending an existing selection rather than starting a new one).
    if (oldSel instanceof TextSelection) {
      const oldAnchorItem = findListItemAncestor(oldSel.$anchor);
      if (oldAnchorItem && oldAnchorItem.itemPos !== anchorItem.itemPos) return null;
    }

    const item = newState.doc.nodeAt(anchorItem.itemPos);
    const paragraph = item?.firstChild;
    if (!paragraph || paragraph.type !== outlinerSchema.nodes.paragraph) return null;
    const paragraphStart = anchorItem.itemPos + 2;
    const paragraphEnd = paragraphStart + paragraph.content.size;

    const forward = newSel.head > newSel.anchor;
    const clampedHead = forward ? paragraphEnd : paragraphStart;
    if (clampedHead === newSel.head) return null;
    return newState.tr.setSelection(TextSelection.create(newState.doc, newSel.anchor, clampedHead));
  },
});
