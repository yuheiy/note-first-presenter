import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { smartBackspace, smartDelete } from '../commands/backspace';
import { outlinerSchema } from '../schema';

function makeFlat(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function topItemTexts(state: EditorState) {
  const out: string[] = [];
  state.doc.firstChild?.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
  return out;
}

function caretAtItemStart(doc: Node, itemIndex: number) {
  // inside doc(=0) → inside bullet_list(=1) → walk to target list_item → inside its paragraph
  let pos = 1;
  doc.firstChild!.forEach((it, _offset, i) => {
    if (i < itemIndex) pos += it.nodeSize;
  });
  return TextSelection.create(doc, pos + 2);
}

function caretAtItemEnd(doc: Node, itemIndex: number) {
  let pos = 1;
  doc.firstChild!.forEach((it, _offset, i) => {
    if (i < itemIndex) pos += it.nodeSize;
  });
  const item = doc.firstChild!.child(itemIndex);
  return TextSelection.create(doc, pos + 2 + item.firstChild!.content.size);
}

describe('smartBackspace', () => {
  it('deletes an empty middle item and moves caret to end of previous paragraph', () => {
    const doc = makeFlat(['a', '', 'c']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 1) });
    let next: EditorState | null = null;
    const ran = smartBackspace(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topItemTexts(next!)).toEqual(['a', 'c']);
  });

  it('merges paragraph content with previous sibling when caret is at start of non-empty item', () => {
    const doc = makeFlat(['a', 'b']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 1) });
    let next: EditorState | null = null;
    const ran = smartBackspace(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topItemTexts(next!)).toEqual(['ab']);
  });

  it('returns false when caret is in the middle of text', () => {
    const doc = makeFlat(['abc']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
    expect(smartBackspace(state, () => {})).toBe(false);
  });

  it('returns false when the only item is empty (lift impossible)', () => {
    const doc = makeFlat(['']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 0) });
    expect(smartBackspace(state, () => {})).toBe(false);
  });

  it('lifts when the first non-empty item has no previous sibling', () => {
    // nested doc: outer list with one item that has nested bullet_list inside
    const inner = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('child')]),
    ]);
    const outer = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('parent')]),
      outlinerSchema.node('bullet_list', null, [inner]),
    ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [outer]),
    ]);
    // caret at start of nested 'child' paragraph
    // positions: 1=inside outer bullet_list, 2=inside outer list_item, 3=inside paragraph
    // 3+'parent'.length=9, 10=close paragraph (positioning aside), then nested bullet_list opens, etc.
    // Easier: find the inner paragraph by walking
    let caret = -1;
    doc.descendants((n, p) => {
      if (caret < 0 && n.type.name === 'paragraph' && n.textContent === 'child') caret = p + 1;
    });
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, caret) });
    let next: EditorState | null = null;
    const ran = smartBackspace(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    // after lift, the 'child' item moved up a level
    expect(next!.doc.firstChild!.childCount).toBe(2);
  });
});

describe('smartDelete', () => {
  it('merges next sibling when caret is at end of non-empty item', () => {
    const doc = makeFlat(['a', 'b']);
    const state = EditorState.create({ doc, selection: caretAtItemEnd(doc, 0) });
    let next: EditorState | null = null;
    const ran = smartDelete(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topItemTexts(next!)).toEqual(['ab']);
  });

  it('returns false at end of the last item', () => {
    const doc = makeFlat(['a']);
    const state = EditorState.create({ doc, selection: caretAtItemEnd(doc, 0) });
    expect(smartDelete(state, () => {})).toBe(false);
  });
});
