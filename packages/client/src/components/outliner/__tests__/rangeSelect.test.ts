import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import {
  exitRangeSelection,
  extendRangeSelectionDown,
  extendRangeSelectionUp,
} from '../commands/rangeSelect';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/nodeRangeSelection';
import { docOf, item, itemPos, makeDoc } from './fixtures';

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
  // - A
  //   - A1
  //   - A2
  // - B
  function makeNestedDoc() {
    return docOf([item('A', [item('A1'), item('A2')]), item('B')]);
  }

  // Position of an item inside A's nested bullet_list: into the outer
  // bullet_list (1), into A (1), past A's paragraph, then walk siblings.
  function nestedItemPos(doc: ReturnType<typeof makeNestedDoc>, index: number) {
    const A = doc.firstChild!.firstChild!;
    const nested = A.lastChild!;
    let pos = 1 + 1 + A.firstChild!.nodeSize + 1;
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

  it('pressing the opposite direction peels a promotion back one layer', () => {
    const doc = makeNestedDoc();
    const sel = createNodeRangeSelection(doc, nestedItemPos(doc, 0), nestedItemPos(doc, 0))!;
    const state = EditorState.create({ doc, selection: sel });
    // Up promotes the nested single-item range out to cover A...
    const promoted = apply(state, extendRangeSelectionUp);
    const promotedSel = promoted.next!.selection as NodeRangeSelection;
    expect(promotedSel.liftedFrom).not.toBeNull();
    // ...and one Down peels back to the nested range on A1, consuming the
    // lift-chain layer it restored.
    const peeled = apply(promoted.next!, extendRangeSelectionDown);
    expect(peeled.ok).toBe(true);
    const restored = peeled.next!.selection as NodeRangeSelection;
    expect(restored).toBeInstanceOf(NodeRangeSelection);
    const texts: string[] = [];
    restored.forEachItem((_pos, node) => texts.push(node.firstChild?.textContent ?? ''));
    expect(texts).toEqual(['A1']);
    expect(restored.liftedFrom).toBeNull();
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
    // - A
    //   - A1
    // A1 has no nested sibling below and A has no next sibling at any level,
    // so promotion fails and the key must be consumed with nothing dispatched.
    const doc = docOf([item('A', [item('A1')])]);
    const nestedPos = 1 + 1 + doc.firstChild!.firstChild!.firstChild!.nodeSize + 1;
    const sel = createNodeRangeSelection(doc, nestedPos, nestedPos)!;
    const state = EditorState.create({ doc, selection: sel });
    let dispatched = false;
    const ok = extendRangeSelectionDown(state, () => {
      dispatched = true;
    });
    expect(ok).toBe(true);
    expect(dispatched).toBe(false);
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
