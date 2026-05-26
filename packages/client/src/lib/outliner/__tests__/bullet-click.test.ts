import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { resolveBulletClickSelection } from '../plugins/bullet-click';
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

describe('resolveBulletClickSelection', () => {
  it('plain click returns a NodeSelection on the clicked item', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 1), false);
    expect(sel).toBeInstanceOf(NodeSelection);
    expect((sel as NodeSelection).from).toBe(itemPos(doc, 1));
  });

  it('shift+click extends current NodeSelection to a NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 2), true);
    expect(sel).toBeInstanceOf(NodeRangeSelection);
    expect((sel as NodeRangeSelection).itemCount).toBe(3);
  });

  it('shift+click extends an existing NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c', 'd']);
    const start = NodeSelection.create(doc, itemPos(doc, 0));
    const state = EditorState.create({ doc, selection: start });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 3), true);
    expect((sel as NodeRangeSelection).itemCount).toBe(4);
  });

  it('shift+click without prior NodeSelection falls back to single NodeSelection', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 0), true);
    expect(sel).toBeInstanceOf(NodeSelection);
  });
});
