import { type Command, type Transaction } from 'prosemirror-state';
import { BULLET_LIST, LIST_ITEM } from '../model/nodes';
import { findListItemDepth } from '../model/position';
import {
  collectAllSelectedItemPositions,
  isNodeRangeSelection,
} from '../selections/nodeRangeSelection';
import { rangeAware } from './rangeAware';

function setCollapsedRange(value: boolean): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    let tr: Transaction | null = null;
    const positions = collectAllSelectedItemPositions(sel);
    for (const pos of positions) {
      const node = state.doc.nodeAt(pos);
      if (!node || node.type !== LIST_ITEM) continue;
      const hasChildList = node.lastChild?.type === BULLET_LIST;
      if (!hasChildList) continue;
      if (!tr) tr = state.tr;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    }
    if (!tr) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

function setCollapsedSingle(value: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findListItemDepth($from);
    if (depth === null) return false;
    const pos = $from.before(depth);
    const node = $from.node(depth);
    const hasChildList = node.lastChild?.type === BULLET_LIST;
    if (!hasChildList) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    if (dispatch) dispatch(tr);
    return true;
  };
}

function setCollapsed(value: boolean): Command {
  return rangeAware(setCollapsedRange(value), setCollapsedSingle(value));
}

export const collapseItem = setCollapsed(true);
export const expandItem = setCollapsed(false);
