import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import {
  findListItemAncestor,
  paragraphEndOf,
  paragraphStartOf,
  SKIP_TEXT_SELECTION_CLAMP_META,
} from '../model/position';

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

    const paragraphEnd = paragraphEndOf(newState.doc, anchorItem.itemPos);
    if (paragraphEnd === null) return null;
    const paragraphStart = paragraphStartOf(anchorItem.itemPos);

    const forward = newSel.head > newSel.anchor;
    const clampedHead = forward ? paragraphEnd : paragraphStart;
    if (clampedHead === newSel.head) return null;
    return newState.tr.setSelection(TextSelection.create(newState.doc, newSel.anchor, clampedHead));
  },
});
