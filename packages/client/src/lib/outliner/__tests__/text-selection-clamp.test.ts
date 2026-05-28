import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { textSelectionClamp } from '../plugins/text-selection-clamp';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemStart(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

function caretInside(doc: ReturnType<typeof makeDoc>, index: number, offset: number) {
  return itemStart(doc, index) + 2 + offset;
}

describe('textSelectionClamp (clamp)', () => {
  it('leaves a within-item TextSelection alone', () => {
    const doc = makeDoc(['abcdef']);
    const state = EditorState.create({ doc, plugins: [textSelectionClamp] });
    const tr = state.tr.setSelection(
      TextSelection.create(doc, caretInside(doc, 0, 0), caretInside(doc, 0, 4)),
    );
    const next = state.apply(tr);
    expect(next.selection).toBeInstanceOf(TextSelection);
    expect(next.selection.head).toBe(caretInside(doc, 0, 4));
  });

  it('clamps head to end of anchor paragraph when forward selection crosses into next item', () => {
    const doc = makeDoc(['abc', 'def']);
    // Start with a real within-item TextSelection so the appendTransaction
    // sees the anchor at the same item across the transition.
    const state = EditorState.create({
      doc,
      plugins: [textSelectionClamp],
      selection: TextSelection.create(doc, caretInside(doc, 0, 0)),
    });
    const tr = state.tr.setSelection(
      TextSelection.create(doc, caretInside(doc, 0, 0), caretInside(doc, 1, 1)),
    );
    const next = state.apply(tr);
    expect(next.selection).toBeInstanceOf(TextSelection);
    expect(next.selection.head).toBe(caretInside(doc, 0, 'abc'.length));
    expect(next.selection.anchor).toBe(caretInside(doc, 0, 0));
  });

  it('clamps head to start of anchor paragraph for backward cross-item selection', () => {
    const doc = makeDoc(['abc', 'def']);
    const state = EditorState.create({
      doc,
      plugins: [textSelectionClamp],
      selection: TextSelection.create(doc, caretInside(doc, 1, 'def'.length)),
    });
    const tr = state.tr.setSelection(
      TextSelection.create(doc, caretInside(doc, 1, 'def'.length), caretInside(doc, 0, 1)),
    );
    const next = state.apply(tr);
    expect(next.selection).toBeInstanceOf(TextSelection);
    expect(next.selection.head).toBe(caretInside(doc, 1, 0));
    expect(next.selection.anchor).toBe(caretInside(doc, 1, 'def'.length));
  });

  it('leaves a click that lands in a different item alone (anchor moved with click)', () => {
    const doc = makeDoc(['abc', 'def']);
    const state = EditorState.create({
      doc,
      plugins: [textSelectionClamp],
      selection: TextSelection.create(doc, caretInside(doc, 0, 1)),
    });
    // Both anchor and head move into item 1 — this is a click, not an extension.
    const tr = state.tr.setSelection(TextSelection.create(doc, caretInside(doc, 1, 1)));
    const next = state.apply(tr);
    expect(next.selection.empty).toBe(true);
    expect(next.selection.from).toBe(caretInside(doc, 1, 1));
  });
});
