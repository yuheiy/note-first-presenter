import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { buildRangeSelectionDecorations } from '../plugins/rangeSelectionDecorations';
import { createNodeRangeSelection, type LiftedFrom } from '../selections/nodeRangeSelection';
import { docOf, item, itemPos, makeDoc } from './fixtures';

function decorationStarts(state: EditorState): number[] {
  return buildRangeSelectionDecorations(state)
    .find()
    .map((d) => d.from)
    .sort((a, b) => a - b);
}

describe('rangeSelectionDecorations', () => {
  it('produces no decorations when no NodeRangeSelection is active', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc });
    expect(decorationStarts(state)).toEqual([]);
  });

  it('adds a data-range-selected decoration to each item in the range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([itemPos(doc, 0), itemPos(doc, 1)]);
  });

  it('covers all items when the range spans the whole list', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([itemPos(doc, 0), itemPos(doc, 1), itemPos(doc, 2)]);
  });

  it('paints additionalItems outside the primary range', () => {
    const doc = makeDoc(['a', 'b', 'c', 'd']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0), null, [
      itemPos(doc, 2),
    ])!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([itemPos(doc, 0), itemPos(doc, 2)]);
  });

  it('does not paint an additional item twice when it coincides with a primary item', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0), null, [
      itemPos(doc, 0),
    ])!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([itemPos(doc, 0)]);
  });

  // - A
  //   - A1
  //   - A2
  // - B
  function nestedDoc() {
    const doc = docOf([item('A', [item('A1'), item('A2')]), item('B')]);
    const A = doc.firstChild!.firstChild!;
    const a1Pos = 1 + 1 + A.firstChild!.nodeSize + 1;
    const a2Pos = a1Pos + A.lastChild!.firstChild!.nodeSize;
    return { doc, a1Pos, a2Pos };
  }

  it('paints lifted-from items that fall outside the primary range', () => {
    const { doc, a2Pos } = nestedDoc();
    // Promoted down out of A2 onto B: the lifted origin (A2) is not inside B,
    // so both stay highlighted.
    const lifted: LiftedFrom = { anchor: a2Pos, head: a2Pos, fromDirection: 1, previous: null };
    const sel = createNodeRangeSelection(doc, itemPos(doc, 1), itemPos(doc, 1), lifted)!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([a2Pos, itemPos(doc, 1)].sort((a, b) => a - b));
  });

  it('skips lifted-from items that sit inside the primary range', () => {
    const { doc, a1Pos } = nestedDoc();
    // Promoted up out of A1 onto A: A contains A1, so only A is painted.
    const lifted: LiftedFrom = { anchor: a1Pos, head: a1Pos, fromDirection: -1, previous: null };
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0), lifted)!;
    const state = EditorState.create({ doc, selection: sel });
    expect(decorationStarts(state)).toEqual([itemPos(doc, 0)]);
  });
});
