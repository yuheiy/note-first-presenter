import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { smartBackspace, smartDelete } from '../commands/backspace';
import { docOf, item, itemPos, makeDoc, topTexts } from './fixtures';

function caretAtItemStart(doc: Node, itemIndex: number) {
  return TextSelection.create(doc, itemPos(doc, itemIndex) + 2);
}

function caretAtItemEnd(doc: Node, itemIndex: number) {
  const target = doc.firstChild!.child(itemIndex);
  return TextSelection.create(doc, itemPos(doc, itemIndex) + 2 + target.firstChild!.content.size);
}

describe('smartBackspace', () => {
  it('deletes an empty middle item and moves caret to end of previous paragraph', () => {
    const doc = makeDoc(['a', '', 'c']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 1) });
    let next: EditorState | null = null;
    const ran = smartBackspace(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topTexts(next!.doc)).toEqual(['a', 'c']);
  });

  it('merges paragraph content with previous sibling when caret is at start of non-empty item', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 1) });
    let next: EditorState | null = null;
    const ran = smartBackspace(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topTexts(next!.doc)).toEqual(['ab']);
  });

  it('returns false when caret is in the middle of text', () => {
    const doc = makeDoc(['abc']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) });
    expect(smartBackspace(state, () => {})).toBe(false);
  });

  it('returns false when the only item is empty (lift impossible)', () => {
    const doc = makeDoc(['']);
    const state = EditorState.create({ doc, selection: caretAtItemStart(doc, 0) });
    expect(smartBackspace(state, () => {})).toBe(false);
  });

  it('lifts when the first non-empty item has no previous sibling', () => {
    const doc = docOf([item('parent', [item('child')])]);
    // caret at start of nested 'child' paragraph, found by walking
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
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: caretAtItemEnd(doc, 0) });
    let next: EditorState | null = null;
    const ran = smartDelete(state, (tr) => {
      next = state.apply(tr);
    });
    expect(ran).toBe(true);
    expect(topTexts(next!.doc)).toEqual(['ab']);
  });

  it('returns false at end of the last item', () => {
    const doc = makeDoc(['a']);
    const state = EditorState.create({ doc, selection: caretAtItemEnd(doc, 0) });
    expect(smartDelete(state, () => {})).toBe(false);
  });
});
