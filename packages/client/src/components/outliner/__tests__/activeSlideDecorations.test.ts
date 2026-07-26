import { EditorState, TextSelection } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vite-plus/test';
import { activeSlideDecorations } from '../plugins/activeSlideDecorations';
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

function activeItemsFor(doc: ReturnType<typeof makeDoc>, caret: number) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, caret),
    plugins: [activeSlideDecorations],
  });
  const fn = activeSlideDecorations.props.decorations!;
  const set = fn.call(activeSlideDecorations, state) as DecorationSet;
  return set
    .find()
    .map((d) => d.from)
    .sort((a, b) => a - b);
}

describe('activeSlideDecorations', () => {
  it('marks every item when the doc is a single slide', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    expect(activeItemsFor(doc, itemPos(doc, 0) + 1)).toEqual([
      itemPos(doc, 0),
      itemPos(doc, 1),
      itemPos(doc, 2),
    ]);
  });

  it('marks only the active slide items when the caret is in the first slide', () => {
    const doc = makeDoc(['a', '---', 'b', 'c']);
    expect(activeItemsFor(doc, itemPos(doc, 0) + 1)).toEqual([itemPos(doc, 0)]);
  });

  it('marks only the active slide items when the caret is in the second slide', () => {
    const doc = makeDoc(['a', '---', 'b', 'c']);
    expect(activeItemsFor(doc, itemPos(doc, 2) + 1)).toEqual([itemPos(doc, 2), itemPos(doc, 3)]);
  });

  it('excludes the separator item itself from the active slide', () => {
    const doc = makeDoc(['a', '---', 'b']);
    expect(activeItemsFor(doc, itemPos(doc, 2) + 1)).toEqual([itemPos(doc, 2)]);
  });
});
