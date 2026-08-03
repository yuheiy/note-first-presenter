import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { duplicateItem } from '../commands/duplicate';
import { moveItemDown, moveItemUp } from '../commands/move';
import { docOf, item, itemPos, makeDoc, topTexts } from './fixtures';

function makeState(texts: string[], caretInItemIndex = 0) {
  const doc = makeDoc(texts);
  // caret at the start of the item's paragraph
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, itemPos(doc, caretInItemIndex) + 2),
  });
}

describe('moveItemUp', () => {
  it('swaps with previous sibling', () => {
    const state = makeState(['a', 'b', 'c'], 1);
    let next: EditorState | null = null;
    moveItemUp(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    expect(topTexts(next!.doc)).toEqual(['b', 'a', 'c']);
  });

  it('returns false at the top of the list', () => {
    const state = makeState(['a', 'b'], 0);
    expect(moveItemUp(state, () => {})).toBe(false);
  });
});

describe('moveItemDown', () => {
  it('swaps with next sibling', () => {
    const state = makeState(['a', 'b', 'c'], 1);
    let next: EditorState | null = null;
    moveItemDown(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    expect(topTexts(next!.doc)).toEqual(['a', 'c', 'b']);
  });

  it('returns false at the bottom of the list', () => {
    const state = makeState(['a', 'b'], 1);
    expect(moveItemDown(state, () => {})).toBe(false);
  });
});

describe('duplicateItem', () => {
  it('inserts a clone immediately after the current item', () => {
    const state = makeState(['a', 'b'], 0);
    let next: EditorState | null = null;
    duplicateItem(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    expect(topTexts(next!.doc)).toEqual(['a', 'a', 'b']);
  });

  it('clones nested children too', () => {
    const doc = docOf([item('parent', [item('child')])]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    let next: EditorState | null = null;
    duplicateItem(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    const list = next!.doc.firstChild!;
    expect(list.childCount).toBe(2);
    expect(list.child(1).childCount).toBe(2);
    expect(list.child(1).lastChild?.type.name).toBe('bullet_list');
  });
});
