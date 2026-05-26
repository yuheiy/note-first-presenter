import { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vite-plus/test';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]): Node {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: Node, index: number): number {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('NodeRangeSelection', () => {
  it('covers a single item as both anchor and head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 1), itemPos(doc, 1));
    expect(sel).not.toBeNull();
    expect(sel!.itemCount).toBe(1);
    expect(sel!.fromIndex).toBe(1);
    expect(sel!.toIndex).toBe(1);
  });

  it('covers two consecutive siblings forward', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1));
    expect(sel!.itemCount).toBe(2);
    expect(sel!.fromIndex).toBe(0);
    expect(sel!.toIndex).toBe(1);
    expect(sel!.from).toBe(itemPos(doc, 0));
    expect(sel!.to).toBe(itemPos(doc, 2));
  });

  it('orders fromIndex/toIndex by position when anchor is after head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 2), itemPos(doc, 0));
    expect(sel!.fromIndex).toBe(0);
    expect(sel!.toIndex).toBe(2);
    expect(sel!.anchorIndex).toBe(2);
    expect(sel!.headIndex).toBe(0);
  });

  it('forEachItem yields each item once in document order', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    const seen: string[] = [];
    sel.forEachItem((_pos, node) => seen.push(node.firstChild?.textContent ?? ''));
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('eq returns true for equal selections', () => {
    const doc = makeDoc(['a', 'b']);
    const a = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const b = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    expect(a.eq(b)).toBe(true);
  });

  it('eq returns false for differing head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const a = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const b = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    expect(a.eq(b)).toBe(false);
  });

  it('NodeRangeSelection instanceof Selection', () => {
    const doc = makeDoc(['a']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0))!;
    expect(sel).toBeInstanceOf(NodeRangeSelection);
  });
});
