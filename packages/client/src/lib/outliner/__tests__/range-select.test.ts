import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import {
  exitRangeSelection,
  extendRangeSelectionDown,
  extendRangeSelectionUp,
} from '../commands/range-select';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

function apply(
  state: EditorState,
  cmd: (s: EditorState, d?: (tr: any) => void) => boolean,
): { ok: boolean; next: EditorState | null } {
  let next: EditorState | null = null;
  const ok = cmd(state, (tr) => {
    next = state.apply(tr);
  });
  return { ok, next };
}

describe('extendRangeSelectionDown', () => {
  it('extends a NodeSelection down by one sibling', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const { ok, next } = apply(state, extendRangeSelectionDown);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
    expect((next!.selection as NodeRangeSelection).headIndex).toBe(1);
  });

  it('extends a NodeRangeSelection further down', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const { next } = apply(state, extendRangeSelectionDown);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(3);
  });

  it('returns false at the last sibling', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 1)),
    });
    expect(extendRangeSelectionDown(state, () => {})).toBe(false);
  });

  it('returns false on TextSelection (falls through)', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(extendRangeSelectionDown(state, () => {})).toBe(false);
  });
});

describe('extendRangeSelectionUp', () => {
  it('extends head up by one', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 2)),
    });
    const { next } = apply(state, extendRangeSelectionUp);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
    expect((next!.selection as NodeRangeSelection).headIndex).toBe(1);
  });

  it('returns false at the first sibling', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    expect(extendRangeSelectionUp(state, () => {})).toBe(false);
  });
});

describe('exitRangeSelection', () => {
  it('converts NodeRangeSelection to TextSelection at end of first item paragraph', () => {
    const doc = makeDoc(['ab', 'cd']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const { ok, next } = apply(state, exitRangeSelection);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(TextSelection);
    expect(next!.selection.from).toBe(itemPos(doc, 0) + 2 + 2);
  });

  it('returns false when selection is already TextSelection', () => {
    const doc = makeDoc(['a']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(exitRangeSelection(state, () => {})).toBe(false);
  });
});
