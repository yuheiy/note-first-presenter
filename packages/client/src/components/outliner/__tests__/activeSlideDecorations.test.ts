import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { buildActiveSlideDecorations } from '../plugins/activeSlideDecorations';
import { itemPos, makeDoc } from './fixtures';

function activeItemsFor(doc: ReturnType<typeof makeDoc>, caret: number) {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, caret) });
  return buildActiveSlideDecorations(state)
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
