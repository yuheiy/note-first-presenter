import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { smartBackspace, smartDelete } from '../commands/backspace';
import { duplicateItem } from '../commands/duplicate';
import { collapseItem, expandItem } from '../commands/fold';
import { moveItemDown, moveItemUp } from '../commands/move';
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

function topTexts(state: EditorState) {
  const list = state.doc.firstChild!;
  const out: string[] = [];
  list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
  return out;
}

function makeRangeState(texts: string[], fromIdx: number, toIdx: number) {
  const doc = makeDoc(texts);
  const sel = createNodeRangeSelection(doc, itemPos(doc, fromIdx), itemPos(doc, toIdx))!;
  return EditorState.create({ doc, selection: sel });
}

describe('moveItemUp on a NodeRangeSelection', () => {
  it('moves the whole range up by one', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(moveItemUp(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['b', 'c', 'a', 'd']);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });

  it('returns false at the top boundary', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    expect(moveItemUp(state, () => {})).toBe(false);
  });
});

describe('moveItemDown on a NodeRangeSelection', () => {
  it('moves the whole range down by one', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(moveItemDown(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a', 'd', 'b', 'c']);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });

  it('returns false at the bottom boundary', () => {
    const state = makeRangeState(['a', 'b', 'c'], 1, 2);
    expect(moveItemDown(state, () => {})).toBe(false);
  });
});

describe('duplicateItem on a NodeRangeSelection', () => {
  it('clones the selected range and inserts it right after the range', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(duplicateItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a', 'b', 'a', 'b', 'c']);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });
});

function makeNestedDoc() {
  // - a
  //   - a1
  // - b
  //   - b1
  // - c (no children)
  const make = (text: string, children?: any[]) => {
    const kids = [outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])];
    if (children) kids.push(outlinerSchema.node('bullet_list', null, children));
    return outlinerSchema.node('list_item', null, kids);
  };
  return outlinerSchema.node('doc', null, [
    outlinerSchema.node('bullet_list', null, [
      make('a', [make('a1')]),
      make('b', [make('b1')]),
      make('c'),
    ]),
  ]);
}

describe('collapseItem on a NodeRangeSelection', () => {
  it('sets collapsed=true on every item with children', () => {
    const doc = makeNestedDoc();
    // Range covers items 0 and 2 (skipping index 1) — adjust to cover [0,2]
    const range = createNodeRangeSelection(
      doc,
      1,
      1 + doc.firstChild!.child(0).nodeSize + doc.firstChild!.child(1).nodeSize,
    )!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(collapseItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    expect(list.child(0).attrs.collapsed).toBe(true);
    expect(list.child(1).attrs.collapsed).toBe(true);
    expect(list.child(2).attrs.collapsed).toBe(false); // no children → skipped
  });
});

describe('expandItem on a NodeRangeSelection', () => {
  it('clears collapsed on items with children', () => {
    // Start with both a and b collapsed
    const make = (text: string, collapsed: boolean, children?: any[]) => {
      const kids = [outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])];
      if (children) kids.push(outlinerSchema.node('bullet_list', null, children));
      return outlinerSchema.node('list_item', { collapsed }, kids);
    };
    const child = (t: string) =>
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text(t)]),
      ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        make('a', true, [child('a1')]),
        make('b', true, [child('b1')]),
      ]),
    ]);
    const range = createNodeRangeSelection(doc, 1, 1 + doc.firstChild!.child(0).nodeSize)!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(expandItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(next!.doc.firstChild!.child(0).attrs.collapsed).toBe(false);
    expect(next!.doc.firstChild!.child(1).attrs.collapsed).toBe(false);
  });
});

describe('smartBackspace on a NodeRangeSelection', () => {
  it('deletes the entire range and leaves caret as TextSelection', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(smartBackspace(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['c']);
  });

  it('replaces the only items with an empty list_item if range covers all', () => {
    const state = makeRangeState(['a', 'b'], 0, 1);
    let next: EditorState | null = null;
    expect(smartBackspace(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    expect(list.type.name).toBe('bullet_list');
    expect(list.childCount).toBe(1);
    expect(list.child(0).firstChild?.textContent).toBe('');
  });
});

describe('smartDelete on a NodeRangeSelection', () => {
  it('behaves identically to smartBackspace on a range', () => {
    const state = makeRangeState(['a', 'b', 'c'], 1, 2);
    let next: EditorState | null = null;
    expect(smartDelete(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a']);
  });
});
