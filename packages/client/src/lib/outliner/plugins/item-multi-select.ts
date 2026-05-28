/**
 * Modifier-aware item selection for the outliner.
 *
 * Plain clicks are left to ProseMirror's default behaviour (caret placement on
 * the paragraph, no selection on the bullet area). Only Shift / Cmd / Ctrl
 * clicks are interpreted as "act on this list_item":
 *
 *   - Cmd/Ctrl+Click toggles the clicked item in the multi-item selection set.
 *   - Shift+Click extends a contiguous range from the current anchor (or the
 *     caret's containing list_item) to the clicked item. Clicking the same
 *     line the caret is on is a no-op.
 *   - Plain click on the bullet area is a no-op (no NodeSelection is created).
 */
import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Selection,
  TextSelection,
} from 'prosemirror-state';
import { createNodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

export interface ItemClickModifiers {
  shift?: boolean;
  meta?: boolean;
}

function isItemSelected(sel: Selection, itemPos: number): boolean {
  if (isNodeRangeSelection(sel)) {
    let found = false;
    sel.forEachItem((pos) => {
      if (pos === itemPos) found = true;
    });
    if (found) return true;
    return sel.additionalItems.includes(itemPos);
  }
  if (sel instanceof NodeSelection && sel.node.type === LIST_ITEM) {
    return sel.from === itemPos;
  }
  return false;
}

function collectPreviouslySelectedExcept(sel: Selection, excludePos: number): number[] {
  const positions: number[] = [];
  if (isNodeRangeSelection(sel)) {
    sel.forEachItem((pos) => {
      if (pos !== excludePos) positions.push(pos);
    });
    for (const pos of sel.additionalItems) {
      if (pos !== excludePos && !positions.includes(pos)) positions.push(pos);
    }
  } else if (sel instanceof NodeSelection && sel.node.type === LIST_ITEM) {
    if (sel.from !== excludePos) positions.push(sel.from);
  }
  return positions;
}

function listItemAncestorPos($pos: import('prosemirror-model').ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) return $pos.before(d);
  }
  return null;
}

function shiftAnchorPos(state: EditorState): number | null {
  const current = state.selection;
  if (isNodeRangeSelection(current)) {
    return current.anchorIndex <= current.headIndex
      ? current.from
      : current.to - current.parentList.child(current.toIndex).nodeSize;
  }
  if (current instanceof NodeSelection && current.node.type === LIST_ITEM) {
    return current.from;
  }
  if (current instanceof TextSelection) {
    return listItemAncestorPos(current.$head);
  }
  return null;
}

export function resolveItemClickSelection(
  state: EditorState,
  itemPos: number,
  mods: ItemClickModifiers = {},
): Selection | null {
  // Cmd/Ctrl click: toggle the clicked item in the selection set.
  if (mods.meta) {
    const wasSelected = isItemSelected(state.selection, itemPos);
    if (wasSelected) {
      const remaining = collectPreviouslySelectedExcept(state.selection, itemPos);
      if (remaining.length === 0) {
        // Last selected item removed — drop back to a TextSelection at the end of
        // the clicked item's paragraph so the editor remains usable.
        const node = state.doc.nodeAt(itemPos);
        const paragraph = node?.firstChild;
        if (paragraph && paragraph.type === outlinerSchema.nodes.paragraph) {
          return TextSelection.create(state.doc, itemPos + 2 + paragraph.content.size);
        }
        return state.selection;
      }
      const newMain = remaining[0];
      const others = remaining.slice(1);
      const range = createNodeRangeSelection(state.doc, newMain, newMain, null, others);
      return range ?? NodeSelection.create(state.doc, newMain);
    }
    const others = collectPreviouslySelectedExcept(state.selection, itemPos);
    const range = createNodeRangeSelection(state.doc, itemPos, itemPos, null, others);
    return range ?? NodeSelection.create(state.doc, itemPos);
  }

  // Shift click: extend a contiguous range from the current anchor (or the
  // caret's list_item) to the clicked item. Same-line clicks and clicks with
  // no list_item context are no-ops.
  if (mods.shift) {
    const anchorPos = shiftAnchorPos(state);
    if (anchorPos === null) return null;
    if (anchorPos === itemPos) return null;
    return createNodeRangeSelection(state.doc, anchorPos, itemPos);
  }

  return null;
}

function resolveItemPosFromTarget(
  view: import('prosemirror-view').EditorView,
  target: Element | null,
): number {
  if (!target) return -1;
  const li = target.closest('li');
  if (!li) return -1;
  const posAt = view.posAtDOM(li, 0);
  const $pos = view.state.doc.resolve(posAt);
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) return $pos.before(d);
  }
  return -1;
}

export const itemMultiSelectPlugin = new Plugin({
  key: new PluginKey('nfp-item-multi-select'),
  props: {
    handleDOMEvents: {
      mousedown(view, event) {
        const ev = event as MouseEvent;
        if (ev.button !== 0) return false;
        const hasModifier = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        if (!hasModifier) return false;

        const itemPos = resolveItemPosFromTarget(view, ev.target as Element | null);
        if (itemPos < 0) return false;

        const sel = resolveItemClickSelection(view.state, itemPos, {
          shift: ev.shiftKey,
          meta: ev.metaKey || ev.ctrlKey,
        });
        if (!sel) return false;

        view.dispatch(view.state.tr.setSelection(sel));
        ev.preventDefault();
        return true;
      },
    },
  },
});
