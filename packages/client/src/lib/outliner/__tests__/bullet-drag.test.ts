import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { computeDropPosition, moveRangeTo } from '../plugins/bullet-drag';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
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

describe('computeDropPosition', () => {
  it('snaps to before/after the hovered item based on half height', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const list = doc.firstChild!;
    // Cursor over item 1 upper half → drop before item 1
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 2,
        sourceToIndex: 2,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 1),
        hoverItem: list.child(1),
        relativeY: 0.3, // upper half
      }),
    ).toBe(itemPos(doc, 1));

    // Lower half → drop after item 1
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 2,
        sourceToIndex: 2,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 1),
        hoverItem: list.child(1),
        relativeY: 0.7,
      }),
    ).toBe(itemPos(doc, 1) + list.child(1).nodeSize);
  });

  it('returns null when drop would be inside the source range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const list = doc.firstChild!;
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 0,
        sourceToIndex: 1,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 0),
        hoverItem: list.child(0),
        relativeY: 0.7, // after item 0 = inside range
      }),
    ).toBeNull();
  });
});

describe('moveRangeTo', () => {
  it('moves a single item down past one sibling', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0))!;
    const state = EditorState.create({ doc, selection: sel });
    const dropPos = itemPos(doc, 2) + doc.firstChild!.child(2).nodeSize; // after c
    const tr = moveRangeTo(state, dropPos);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    const list = next.doc.firstChild!;
    const out: string[] = [];
    list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
    expect(out).toEqual(['b', 'c', 'a']);
    expect(next.selection).toBeInstanceOf(NodeRangeSelection);
  });

  it('returns null if drop pos is inside source range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const dropPos = itemPos(doc, 1); // inside [0..1]
    expect(moveRangeTo(state, dropPos)).toBeNull();
  });
});
