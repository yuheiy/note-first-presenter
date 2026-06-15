import { type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vite-plus/test';
import { outlinerSchema } from '../schema';
import { adjacentItemPos, childPosAt, findItemAncestor, findItemDepth } from '../tree';

function p(t: string) {
  return outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []);
}

function item(text: string, childList?: Node) {
  const content = childList ? [p(text), childList] : [p(text)];
  return outlinerSchema.node('list_item', null, content);
}

function list(...items: Node[]) {
  return outlinerSchema.node('bullet_list', null, items);
}

function docOf(listNode: Node) {
  return outlinerSchema.node('doc', null, [listNode]);
}

// Position right before the top-level list_item at `index` (its open boundary).
function itemPos(doc: Node, index: number) {
  let pos = 1;
  const listNode = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += listNode.child(i).nodeSize;
  return pos;
}

// A caret position inside the paragraph of the top-level item at `index`.
function caretIn(doc: Node, index: number) {
  return itemPos(doc, index) + 2;
}

describe('findItemDepth', () => {
  it('returns the depth of the enclosing list_item', () => {
    const d = docOf(list(item('a'), item('b')));
    const $pos = d.resolve(caretIn(d, 1));
    const depth = findItemDepth($pos);
    expect(depth).not.toBeNull();
    expect($pos.node(depth!).type).toBe(outlinerSchema.nodes.list_item);
  });

  it('returns null outside any list_item', () => {
    const d = docOf(list(item('a')));
    expect(findItemDepth(d.resolve(0))).toBeNull();
  });

  it('resolves to the innermost item in a nested outline', () => {
    const d = docOf(list(item('a', list(item('child')))));
    let textPos = -1;
    d.descendants((node, pos) => {
      if (node.isText && node.text === 'child') textPos = pos + 1;
    });
    const $pos = d.resolve(textPos);
    const depth = findItemDepth($pos)!;
    expect($pos.node(depth).firstChild!.textContent).toBe('child');
  });
});

describe('findItemAncestor', () => {
  it('returns the enclosing item, its parent list, and index', () => {
    const d = docOf(list(item('a'), item('b'), item('c')));
    const anc = findItemAncestor(d.resolve(caretIn(d, 2)))!;
    expect(anc.index).toBe(2);
    expect(anc.parent.type).toBe(outlinerSchema.nodes.bullet_list);
    expect(anc.itemPos).toBe(itemPos(d, 2));
    expect(childPosAt(anc.parent, anc.parentPos, 2)).toBe(itemPos(d, 2));
  });

  it('returns null outside any list_item', () => {
    const d = docOf(list(item('a')));
    expect(findItemAncestor(d.resolve(0))).toBeNull();
  });
});

describe('childPosAt', () => {
  it('returns the absolute position of the nth child', () => {
    const d = docOf(list(item('a'), item('b'), item('c')));
    const listNode = d.firstChild!;
    expect(childPosAt(listNode, 1, 0)).toBe(itemPos(d, 0));
    expect(childPosAt(listNode, 1, 2)).toBe(itemPos(d, 2));
  });
});

describe('adjacentItemPos', () => {
  it('returns the adjacent sibling item position in each direction', () => {
    const d = docOf(list(item('a'), item('b'), item('c')));
    expect(adjacentItemPos(d, itemPos(d, 1), 1)).toBe(itemPos(d, 2));
    expect(adjacentItemPos(d, itemPos(d, 1), -1)).toBe(itemPos(d, 0));
  });

  it('returns null at the list boundaries', () => {
    const d = docOf(list(item('a'), item('b')));
    expect(adjacentItemPos(d, itemPos(d, 0), -1)).toBeNull();
    expect(adjacentItemPos(d, itemPos(d, 1), 1)).toBeNull();
  });
});
