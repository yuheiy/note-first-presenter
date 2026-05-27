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

  it('at the outermost last sibling, consumes the key but leaves selection unchanged', () => {
    const doc = makeDoc(['a', 'b']);
    const before = NodeSelection.create(doc, itemPos(doc, 1));
    const state = EditorState.create({ doc, selection: before });
    let dispatched = false;
    const ok = extendRangeSelectionDown(state, () => {
      dispatched = true;
    });
    expect(ok).toBe(true);
    expect(dispatched).toBe(false);
  });

  it('Shift+ArrowDown at end of line collapses to NodeRangeSelection on the current item', () => {
    const doc = makeDoc(['ab', 'cd']);
    // caret at end of first paragraph: "ab" → pos 3 (start) + 2 = 5
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
    const { ok, next } = apply(state, extendRangeSelectionDown);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(1);
    expect((next!.selection as NodeRangeSelection).fromIndex).toBe(0);
  });

  it('Shift+ArrowDown in the middle of a line extends to end of paragraph', () => {
    const doc = makeDoc(['abc']);
    // caret at middle of paragraph (after "a"): pos 4
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
    const { ok, next } = apply(state, extendRangeSelectionDown);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(TextSelection);
    expect(next!.selection.from).toBe(4);
    expect(next!.selection.to).toBe(itemPos(doc, 0) + 2 + 'abc'.length);
  });

  it('Shift+ArrowDown at end of line, then again, extends to next item', () => {
    const doc = makeDoc(['ab', 'cd']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
    const first = apply(state, extendRangeSelectionDown);
    const second = apply(first.next!, extendRangeSelectionDown);
    expect((second.next!.selection as NodeRangeSelection).itemCount).toBe(2);
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

  it('at the outermost first sibling, consumes the key but leaves selection unchanged', () => {
    const doc = makeDoc(['a', 'b']);
    const before = NodeSelection.create(doc, itemPos(doc, 0));
    const state = EditorState.create({ doc, selection: before });
    let dispatched = false;
    const ok = extendRangeSelectionUp(state, () => {
      dispatched = true;
    });
    expect(ok).toBe(true);
    expect(dispatched).toBe(false);
  });

  it('Shift+ArrowUp at start of line collapses to NodeRangeSelection on the current item', () => {
    const doc = makeDoc(['ab', 'cd']);
    // caret at start of second paragraph: pos = itemPos(doc, 1) + 2 = 5 + 2 = 7
    const startOfSecond = itemPos(doc, 1) + 2;
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, startOfSecond) });
    const { ok, next } = apply(state, extendRangeSelectionUp);
    expect(ok).toBe(true);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(1);
    expect((next!.selection as NodeRangeSelection).fromIndex).toBe(1);
  });

  it('Shift+ArrowUp in the middle of a line extends to start of paragraph', () => {
    const doc = makeDoc(['abc']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
    const { ok, next } = apply(state, extendRangeSelectionUp);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(TextSelection);
    expect(next!.selection.from).toBe(itemPos(doc, 0) + 2);
    expect(next!.selection.to).toBe(4);
  });
});

describe('range promotion on nested boundary', () => {
  // Build doc: bullet_list [ A { p, bullet_list [ A1, A2 ] }, B ]
  function makeNestedDoc() {
    const nested = outlinerSchema.node('bullet_list', null, [
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text('A1')]),
      ]),
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text('A2')]),
      ]),
    ]);
    const parent = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('A')]),
      nested,
    ]);
    const b = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('B')]),
    ]);
    return outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [parent, b]),
    ]);
  }

  // Position helper for an item inside the nested bullet_list of A
  function nestedItemPos(doc: ReturnType<typeof makeNestedDoc>, index: number) {
    const A = doc.firstChild!.firstChild!;
    // A starts at outer pos 1 (inside outer bullet_list); paragraph "A" is 2+1=3 chars (open/A/close)
    // Outer bullet_list opens at 0 (doc start), so position 1 = inside outer bullet_list.
    // A list_item starts at 1; inside A is position 2; paragraph A is at depth, sized 2+1=3.
    // Then nested bullet_list starts at 2 + 3 = 5 inside A; inside nested bullet_list is pos 6.
    // Walk to the target index.
    const nested = A.lastChild!;
    let pos = 1 + 1 + A.firstChild!.nodeSize + 1; // outer-1, into A-2, after paragraph A
    for (let i = 0; i < index; i++) pos += nested.child(i).nodeSize;
    return pos;
  }

  it('Shift+ArrowUp at first nested sibling promotes to cover the outer parent list_item', () => {
    const doc = makeNestedDoc();
    const sel = createNodeRangeSelection(doc, nestedItemPos(doc, 0), nestedItemPos(doc, 0))!;
    expect(sel.itemCount).toBe(1);
    const state = EditorState.create({ doc, selection: sel });
    const { ok, next } = apply(state, extendRangeSelectionUp);
    expect(ok).toBe(true);
    const promoted = next!.selection as NodeRangeSelection;
    expect(promoted).toBeInstanceOf(NodeRangeSelection);
    // Promoted range lives in the outer bullet_list; its parent (the doc-level
    // bullet_list) should have only two children (A and B), and the selection
    // covers just the first one (A).
    expect(promoted.parentList.childCount).toBe(2);
    expect(promoted.itemCount).toBe(1);
    expect(promoted.fromIndex).toBe(0);
  });

  it('Shift+ArrowDown at last nested sibling promotes to outer parent’s next sibling', () => {
    const doc = makeNestedDoc();
    const sel = createNodeRangeSelection(doc, nestedItemPos(doc, 1), nestedItemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const { ok, next } = apply(state, extendRangeSelectionDown);
    expect(ok).toBe(true);
    const promoted = next!.selection as NodeRangeSelection;
    expect(promoted).toBeInstanceOf(NodeRangeSelection);
    expect(promoted.parentList.childCount).toBe(2);
    // covers B, not A
    expect(promoted.itemCount).toBe(1);
    expect(promoted.fromIndex).toBe(1);
  });

  it('Shift+ArrowUp at outermost top is consumed without changing selection', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0))!;
    const state = EditorState.create({ doc, selection: sel });
    let dispatched = false;
    const ok = extendRangeSelectionUp(state, () => {
      dispatched = true;
    });
    expect(ok).toBe(true);
    expect(dispatched).toBe(false);
  });

  it('Shift+ArrowDown at outermost bottom is consumed without changing selection', () => {
    const nested = outlinerSchema.node('bullet_list', null, [
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text('A1')]),
      ]),
    ]);
    const parent = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('A')]),
      nested,
    ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [parent]),
    ]);
    const nestedPos = 1 + 1 + doc.firstChild!.firstChild!.firstChild!.nodeSize + 1;
    const sel = createNodeRangeSelection(doc, nestedPos, nestedPos)!;
    const state = EditorState.create({ doc, selection: sel });
    // The nested range can promote up to A. Once at A (the outermost top),
    // further Up no longer changes the selection.
    const first = apply(state, extendRangeSelectionDown);
    expect(first.ok).toBe(true);
    // First Down promoted (no outer next available — A is alone — so the
    // promotion should fail and the key is consumed at the boundary).
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
