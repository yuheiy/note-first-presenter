import { Fragment, type Node } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';
import { resolveBulletClickSelection } from './bullet-click';

const LIST_ITEM = outlinerSchema.nodes.list_item;

export interface ComputeDropPositionInput {
  doc: Node;
  sourceFromIndex: number;
  sourceToIndex: number;
  sourceDepth: number;
  hoverItemPos: number;
  hoverItem: Node;
  relativeY: number; // 0..1 within the item element
}

export function computeDropPosition(input: ComputeDropPositionInput): number | null {
  const dropPos =
    input.relativeY < 0.5 ? input.hoverItemPos : input.hoverItemPos + input.hoverItem.nodeSize;
  // Translate dropPos to an index in the same parent list. Only allow drop at same-parent
  // boundaries and reject positions strictly inside the source range.
  try {
    const $pos = input.doc.resolve(dropPos);
    if ($pos.depth !== input.sourceDepth) return null;
    const idx = $pos.index($pos.depth);
    if (idx > input.sourceFromIndex && idx <= input.sourceToIndex) return null;
    return dropPos;
  } catch {
    return null;
  }
}

export function moveRangeTo(state: EditorState, dropPos: number): Transaction | null {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return null;
  if (dropPos > sel.from && dropPos < sel.to) return null;
  if (dropPos === sel.from || dropPos === sel.to) return null;

  const items: Node[] = [];
  sel.forEachItem((_p, n) => items.push(n));

  let tr = state.tr.delete(sel.from, sel.to);
  const adjustedDrop = dropPos > sel.to ? dropPos - (sel.to - sel.from) : dropPos;
  tr = tr.insert(adjustedDrop, Fragment.fromArray(items));
  const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
  const newFrom = adjustedDrop;
  const lastSize = items[items.length - 1].nodeSize;
  const forward = sel.anchorIndex <= sel.headIndex;
  const anchorPos = forward ? newFrom : newFrom + itemsSize - lastSize;
  const headPos = forward ? newFrom + itemsSize - lastSize : newFrom;
  try {
    tr = tr.setSelection(
      new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)),
    );
  } catch {
    // selection fallback handled by caller
  }
  return tr.scrollIntoView();
}

interface DragState {
  phase: 'idle' | 'pending' | 'dragging';
  sourceFrom?: number;
  sourceTo?: number;
  sourceDepth?: number;
  startX?: number;
  startY?: number;
  dropPos?: number | null;
}

const DRAG_THRESHOLD = 3;
const KEY = new PluginKey<DragState>('nfp-bullet-drag');

export const bulletDragPlugin = new Plugin<DragState>({
  key: KEY,
  state: {
    init: () => ({ phase: 'idle' }),
    apply(tr, value) {
      const meta = tr.getMeta(KEY);
      if (meta) return meta as DragState;
      return value;
    },
  },
  props: {
    decorations(state) {
      const drag = KEY.getState(state);
      if (!drag || drag.phase !== 'dragging' || drag.dropPos == null) return null;
      const indicator = document.createElement('div');
      indicator.className = 'nfp-drop-indicator';
      return DecorationSet.create(state.doc, [
        Decoration.widget(drag.dropPos, indicator, { side: -1 }),
      ]);
    },
    handleDOMEvents: {
      mousedown(view, event) {
        const ev = event as MouseEvent;
        if (ev.button !== 0 || ev.shiftKey) return false;
        const target = ev.target as Element | null;
        if (!target) return false;
        if (target.closest('p')) return false;
        const li = target.closest('li');
        if (!li) return false;
        const posAt = view.posAtDOM(li, 0);
        const $pos = view.state.doc.resolve(posAt);
        let itemPos = -1;
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type === LIST_ITEM) {
            itemPos = $pos.before(d);
            break;
          }
        }
        if (itemPos < 0) return false;
        // Update selection (range maintenance handled by resolveBulletClickSelection).
        const sel = resolveBulletClickSelection(view.state, itemPos, ev.shiftKey);
        const tr = view.state.tr.setSelection(sel);
        const next = view.state.apply(tr);
        view.updateState(next);
        const range = next.selection;
        const drag: DragState = {
          phase: 'pending',
          sourceFrom: range.from,
          sourceTo: range.to,
          sourceDepth: isNodeRangeSelection(range) ? range.parentDepth : range.$from.depth,
          startX: ev.clientX,
          startY: ev.clientY,
        };
        view.dispatch(next.tr.setMeta(KEY, drag));
        attachWindowListeners(view);
        ev.preventDefault();
        return true;
      },
    },
  },
});

function attachWindowListeners(view: EditorView) {
  const onMove = (ev: MouseEvent) => onDragMove(view, ev);
  const onUp = (ev: MouseEvent) => {
    onDragEnd(view, ev);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onDragMove(view: EditorView, ev: MouseEvent) {
  const drag = KEY.getState(view.state);
  if (!drag || drag.phase === 'idle') return;
  if (drag.phase === 'pending') {
    const dx = ev.clientX - (drag.startX ?? 0);
    const dy = ev.clientY - (drag.startY ?? 0);
    if (Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
    document.body.classList.add('nfp-dragging');
  }
  const at = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
  if (!at) return;
  const $pos = view.state.doc.resolve(at.pos);
  let hoverItemPos = -1;
  let hoverItem: Node | null = null;
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) {
      hoverItemPos = $pos.before(d);
      hoverItem = $pos.node(d);
      break;
    }
  }
  if (hoverItemPos < 0 || !hoverItem) return;
  const liEl = view.nodeDOM(hoverItemPos) as HTMLElement | null;
  let relativeY = 0.5;
  if (liEl) {
    const rect = liEl.getBoundingClientRect();
    relativeY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
  }
  const dropPos = computeDropPosition({
    doc: view.state.doc,
    sourceFromIndex: getIndexFromPos(view.state.doc, drag.sourceFrom ?? 0),
    sourceToIndex: getIndexFromPos(view.state.doc, (drag.sourceTo ?? 0) - 1),
    sourceDepth: drag.sourceDepth ?? 1,
    hoverItemPos,
    hoverItem,
    relativeY,
  });
  const updated: DragState = {
    ...drag,
    phase: 'dragging',
    dropPos,
  };
  view.dispatch(view.state.tr.setMeta(KEY, updated));
}

function getIndexFromPos(doc: Node, pos: number): number {
  try {
    const $pos = doc.resolve(pos);
    return $pos.index($pos.depth);
  } catch {
    return 0;
  }
}

function onDragEnd(view: EditorView, _ev: MouseEvent) {
  const drag = KEY.getState(view.state);
  document.body.classList.remove('nfp-dragging');
  if (!drag) return;
  if (drag.phase === 'dragging' && drag.dropPos != null) {
    const tr = moveRangeTo(view.state, drag.dropPos);
    if (tr) {
      view.dispatch(tr.setMeta(KEY, { phase: 'idle' }));
      return;
    }
  }
  view.dispatch(view.state.tr.setMeta(KEY, { phase: 'idle' }));
}
