import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { resolveItemClickSelection } from '../plugins/item-multi-select';
import { NodeRangeSelection } from '../selections/node-range-selection';
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

describe('resolveItemClickSelection', () => {
  it('plain click is a no-op (returns null)', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveItemClickSelection(state, itemPos(doc, 1));
    expect(sel).toBeNull();
  });

  it('shift+click extends current NodeSelection to a NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const sel = resolveItemClickSelection(state, itemPos(doc, 2), { shift: true });
    expect(sel).toBeInstanceOf(NodeRangeSelection);
    expect((sel as NodeRangeSelection).itemCount).toBe(3);
  });

  it('shift+click extends an existing NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c', 'd']);
    const start = NodeSelection.create(doc, itemPos(doc, 0));
    const state = EditorState.create({ doc, selection: start });
    const sel = resolveItemClickSelection(state, itemPos(doc, 3), { shift: true });
    expect((sel as NodeRangeSelection).itemCount).toBe(4);
  });

  it('shift+click on the same line as the caret is a no-op', () => {
    const doc = makeDoc(['abc', 'def']);
    // caret in first item's paragraph
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveItemClickSelection(state, itemPos(doc, 0), { shift: true });
    expect(sel).toBeNull();
  });

  it('shift+click from a caret on another line extends a range from the caret line to the clicked line', () => {
    const doc = makeDoc(['abc', 'def', 'ghi']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) }); // caret in first
    const sel = resolveItemClickSelection(state, itemPos(doc, 2), { shift: true });
    expect(sel).toBeInstanceOf(NodeRangeSelection);
    expect((sel as NodeRangeSelection).itemCount).toBe(3);
  });
});

describe('resolveItemClickSelection with Cmd/Ctrl', () => {
  it('meta+click on an unselected item adds it to the selection', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const sel = resolveItemClickSelection(state, itemPos(doc, 2), { meta: true });
    expect(sel).toBeInstanceOf(NodeRangeSelection);
    const range = sel as NodeRangeSelection;
    // Last-clicked item becomes the main range; the previous selection survives as additional.
    expect(range.fromIndex).toBe(2);
    expect(range.toIndex).toBe(2);
    expect(range.additionalItems).toEqual([itemPos(doc, 0)]);
  });

  it('meta+click on an already-selected additional item removes it', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const initial = NodeSelection.create(doc, itemPos(doc, 0));
    const stateA = EditorState.create({ doc, selection: initial });
    const afterAdd = resolveItemClickSelection(stateA, itemPos(doc, 2), { meta: true });
    if (!afterAdd) throw new Error('expected selection');
    const stateB = EditorState.create({ doc, selection: afterAdd });
    // Cmd+Click on item 2 again should remove it.
    const afterRemove = resolveItemClickSelection(stateB, itemPos(doc, 2), { meta: true });
    // Only item 0 should remain selected.
    if (afterRemove instanceof NodeRangeSelection) {
      expect(afterRemove.fromIndex).toBe(0);
      expect(afterRemove.toIndex).toBe(0);
      expect(afterRemove.additionalItems.length).toBe(0);
    } else if (afterRemove instanceof NodeSelection) {
      expect(afterRemove.from).toBe(itemPos(doc, 0));
    } else {
      throw new Error('expected list_item selection');
    }
  });

  it('meta+click that removes the last selected item falls back to a TextSelection', () => {
    const doc = makeDoc(['ab', 'cd']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const sel = resolveItemClickSelection(state, itemPos(doc, 0), { meta: true });
    expect(sel).toBeInstanceOf(TextSelection);
    if (!sel) throw new Error('expected selection');
    expect(sel.from).toBe(itemPos(doc, 0) + 2 + 'ab'.length);
  });

  it('meta+click can build up several non-contiguous selections', () => {
    const doc = makeDoc(['a', 'b', 'c', 'd']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const afterFirst = resolveItemClickSelection(state, itemPos(doc, 2), { meta: true });
    if (!afterFirst) throw new Error('expected selection');
    const second = EditorState.create({ doc, selection: afterFirst });
    const afterSecond = resolveItemClickSelection(second, itemPos(doc, 3), { meta: true });
    expect(afterSecond).toBeInstanceOf(NodeRangeSelection);
    const range = afterSecond as NodeRangeSelection;
    expect(range.fromIndex).toBe(3);
    expect(range.toIndex).toBe(3);
    // The additional set should hold the two previously-selected items.
    expect(range.additionalItems.length).toBe(2);
    expect(new Set(range.additionalItems)).toEqual(new Set([itemPos(doc, 0), itemPos(doc, 2)]));
  });
});
