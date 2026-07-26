import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { duplicateItem } from '../commands/duplicate';
import { moveItemDown, moveItemUp } from '../commands/move';
import { outlinerSchema } from '../schema';

function makeState(texts: string[], caretInItemIndex = 0) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  const doc = outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
  let pos = 1; // inside bullet_list opening
  for (let i = 0; i < caretInItemIndex; i++) pos += items[i].nodeSize;
  // move into the item (paragraph start)
  pos += 2;
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

function topItemTexts(state: EditorState) {
  const list = state.doc.firstChild;
  if (!list) return [];
  const out: string[] = [];
  list.forEach((it) => {
    out.push(it.firstChild?.textContent ?? '');
  });
  return out;
}

describe('moveItemUp', () => {
  it('swaps with previous sibling', () => {
    const state = makeState(['a', 'b', 'c'], 1);
    let next: EditorState | null = null;
    moveItemUp(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    expect(topItemTexts(next!)).toEqual(['b', 'a', 'c']);
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
    expect(topItemTexts(next!)).toEqual(['a', 'c', 'b']);
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
    expect(topItemTexts(next!)).toEqual(['a', 'a', 'b']);
  });

  it('clones nested children too', () => {
    const child = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('child')]),
    ]);
    const parent = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('parent')]),
      outlinerSchema.node('bullet_list', null, [child]),
    ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [parent]),
    ]);
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
