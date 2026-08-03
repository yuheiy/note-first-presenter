import type { Command } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/nodeRangeSelection';

/**
 * Dispatch on the selection kind: `rangeCmd` when a NodeRangeSelection is
 * active, `singleCmd` otherwise. The chosen command's verdict is final — a
 * false from `rangeCmd` does not fall through to `singleCmd`, it hands the key
 * back to whatever binding comes next.
 */
export function rangeAware(rangeCmd: Command, singleCmd: Command): Command {
  return (state, dispatch, view) =>
    isNodeRangeSelection(state.selection)
      ? rangeCmd(state, dispatch, view)
      : singleCmd(state, dispatch, view);
}
