import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { smartBackspace, smartDelete } from '../commands/backspace';
import { duplicateItem } from '../commands/duplicate';
import { collapseItem, expandItem } from '../commands/fold';
import { rangeAwareLiftListItem, rangeAwareSinkListItem } from '../commands/rangeIndent';
import { rangeAwareSplitListItem } from '../commands/rangeSplit';
import { moveItemDown, moveItemUp } from '../commands/move';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/nodeRangeSelection';
import { outlinerSchema } from '../schema';
import { docOf, item, itemPos, itemTexts, makeDoc, topTexts } from './fixtures';

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
    expect(topTexts(next!.doc)).toEqual(['b', 'c', 'a', 'd']);
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
    expect(topTexts(next!.doc)).toEqual(['a', 'd', 'b', 'c']);
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
    expect(topTexts(next!.doc)).toEqual(['a', 'b', 'a', 'b', 'c']);
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
  return docOf([item('a', [item('a1')]), item('b', [item('b1')]), item('c')]);
}

describe('collapseItem on a NodeRangeSelection', () => {
  it('sets collapsed=true on every item with children', () => {
    const doc = makeNestedDoc();
    // Built without attrs, so this also pins the schema's default.
    expect(doc.firstChild!.child(0).attrs.collapsed).toBe(false);
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
    const doc = docOf([make('a', true, [item('a1')]), make('b', true, [item('b1')])]);
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
    expect(topTexts(next!.doc)).toEqual(['c']);
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
    expect(topTexts(next!.doc)).toEqual(['a']);
  });
});

describe('rangeAwareSinkListItem (Tab)', () => {
  it('indents every item in the range under the previous sibling', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(rangeAwareSinkListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    expect(topTexts(next!.doc)).toEqual(['a', 'd']);
    const nested = list.child(0).lastChild!;
    expect(nested.type.name).toBe('bullet_list');
    // The indented items land under 'a', in order, as its nested children.
    expect(itemTexts(nested)).toEqual(['b', 'c']);
  });

  it('returns false if no previous sibling exists', () => {
    const state = makeRangeState(['a', 'b'], 0, 1);
    expect(rangeAwareSinkListItem(state, () => {})).toBe(false);
  });
});

describe('rangeAwareSplitListItem (Enter)', () => {
  it('deletes the range and leaves a single empty item with TextSelection at start', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(rangeAwareSplitListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!.doc)).toEqual(['', 'c']);
  });

  it('falls through to default splitListItem when not a NodeRangeSelection', () => {
    // ensure command returns false so default Enter handler can run
    const doc = makeDoc(['ab']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(rangeAwareSplitListItem(state, () => {})).toBe(false);
  });
});

describe('rangeAwareLiftListItem (Shift-Tab)', () => {
  it('outdents nested range back to the parent list', () => {
    // - a
    //   - b
    //   - c
    // - d
    const sub = [item('b'), item('c')];
    const a = item('a', sub);
    const doc = docOf([a, item('d')]);
    // Compute positions of b and c (inside a's nested list)
    const aStart = 1; // before a
    const innerListStart = aStart + 1 /* into a */ + a.firstChild!.nodeSize; // inside a > after paragraph
    const bPos = innerListStart + 1;
    const cPos = bPos + sub[0].nodeSize;
    const range = createNodeRangeSelection(doc, bPos, cPos)!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(rangeAwareLiftListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    // After lift, b and c become top-level siblings.
    expect(topTexts(next!.doc)).toEqual(['a', 'b', 'c', 'd']);
  });
});
