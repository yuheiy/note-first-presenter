import { Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { sliceToIndentedText } from '../plugins/clipboard';
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

describe('NodeRangeSelection clipboard', () => {
  it('selection.content() returns a usable Slice for INTERNAL_MIME round-trip', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const slice = state.selection.content();
    const json = slice.toJSON();
    expect(json).toBeTruthy();
    const restored = Slice.fromJSON(outlinerSchema, json);
    expect(restored.content.childCount).toBe(2);
    expect(restored.content.child(0).firstChild?.textContent).toBe('a');
  });

  it('sliceToIndentedText serializes a NodeRangeSelection slice', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    expect(sliceToIndentedText(state.selection.content())).toBe('- a\n- b');
  });

  it('paste of the same slice into an empty paragraph replaces with the range items', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const slice = state.selection.content();
    // Apply replaceSelection at a TextSelection inside the first paragraph
    const empty = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]),
      ]),
    ]);
    const target = EditorState.create({ doc: empty });
    const tr = target.tr.replaceSelection(slice);
    const next = target.apply(tr);
    const list = next.doc.firstChild!;
    // first empty item becomes 'a'; new sibling 'b' added
    expect(list.childCount).toBe(2);
    expect(list.child(0).firstChild?.textContent).toBe('a');
    expect(list.child(1).firstChild?.textContent).toBe('b');
  });
});
