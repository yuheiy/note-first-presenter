import { EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vite-plus/test';
import { rangeSelectionDecorations } from '../plugins/range-selection-decorations';
import { createNodeRangeSelection } from '../selections/node-range-selection';
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

function decorationsFor(state: EditorState): DecorationSet | null {
  const fn = rangeSelectionDecorations.props.decorations;
  if (!fn) return null;
  return fn.call(rangeSelectionDecorations, state) as DecorationSet | null;
}

describe('rangeSelectionDecorations', () => {
  it('produces no decorations when no NodeRangeSelection is active', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, plugins: [rangeSelectionDecorations] });
    expect(decorationsFor(state)?.find().length ?? 0).toBe(0);
  });

  it('adds a data-range-selected decoration to each item in the range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({
      doc,
      selection: sel,
      plugins: [rangeSelectionDecorations],
    });
    const decos = decorationsFor(state)!.find();
    expect(decos.length).toBe(2);
  });

  it('covers all items when the range spans the whole list', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    const state = EditorState.create({
      doc,
      selection: sel,
      plugins: [rangeSelectionDecorations],
    });
    expect(decorationsFor(state)!.find().length).toBe(3);
  });
});
