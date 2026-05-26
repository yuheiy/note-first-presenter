import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
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
