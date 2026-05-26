import { Fragment, type Node, type ResolvedPos, Slice } from 'prosemirror-model';
import {
  Selection,
  type SelectionBookmark,
  SelectionRange,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

export class NodeRangeSelection extends Selection {
  constructor($anchor: ResolvedPos, $head: ResolvedPos) {
    const aIndex = $anchor.index($anchor.depth);
    const hIndex = $head.index($head.depth);
    const fromIndex = Math.min(aIndex, hIndex);
    const toIndex = Math.max(aIndex, hIndex);
    const parent = $anchor.node($anchor.depth);
    const parentStart = $anchor.start($anchor.depth);

    let fromPos = parentStart;
    for (let i = 0; i < fromIndex; i++) fromPos += parent.child(i).nodeSize;
    let toPos = parentStart;
    for (let i = 0; i <= toIndex; i++) toPos += parent.child(i).nodeSize;

    // Keep original $anchor/$head (each pointing *before* an item in the parent
    // bullet_list) so that anchorIndex/headIndex preserve direction. Override
    // $from/$to via a custom SelectionRange spanning the whole range (before
    // the first item to after the last item).
    const $from = $anchor.doc.resolve(fromPos);
    const $to = $anchor.doc.resolve(toPos);
    super($anchor, $head, [new SelectionRange($from, $to)]);
  }

  get parentDepth(): number {
    return this.$anchor.depth;
  }

  get parentList(): Node {
    return this.$anchor.node(this.parentDepth);
  }

  get parentListPos(): number {
    return this.$anchor.start(this.parentDepth);
  }

  get anchorIndex(): number {
    return this.$anchor.index(this.$anchor.depth);
  }

  get headIndex(): number {
    return this.$head.index(this.$head.depth);
  }

  get fromIndex(): number {
    return Math.min(this.anchorIndex, this.headIndex);
  }

  get toIndex(): number {
    return Math.max(this.anchorIndex, this.headIndex);
  }

  get itemCount(): number {
    return this.toIndex - this.fromIndex + 1;
  }

  forEachItem(fn: (pos: number, node: Node, index: number) => void): void {
    const list = this.parentList;
    let pos = this.parentListPos;
    for (let i = 0; i < this.fromIndex; i++) pos += list.child(i).nodeSize;
    for (let i = this.fromIndex; i <= this.toIndex; i++) {
      const node = list.child(i);
      fn(pos, node, i);
      pos += node.nodeSize;
    }
  }

  eq(other: Selection): boolean {
    return (
      other instanceof NodeRangeSelection &&
      other.$anchor.pos === this.$anchor.pos &&
      other.$head.pos === this.$head.pos
    );
  }

  map(doc: Node, mapping: Mappable): Selection {
    const anchor = mapping.mapResult(this.$anchor.pos);
    const head = mapping.mapResult(this.$head.pos);
    if (anchor.deleted || head.deleted) return TextSelection.near(doc.resolve(anchor.pos));
    try {
      const $a = doc.resolve(anchor.pos);
      const $h = doc.resolve(head.pos);
      const valid =
        $a.depth === $h.depth &&
        $a.node($a.depth) === $h.node($h.depth) &&
        $a.node($a.depth).type === BULLET_LIST;
      if (!valid) return TextSelection.near(doc.resolve(anchor.pos));
      return new NodeRangeSelection($a, $h);
    } catch {
      return TextSelection.near(doc.resolve(anchor.pos));
    }
  }

  content(): Slice {
    const items: Node[] = [];
    this.forEachItem((_pos, node) => items.push(node));
    return new Slice(Fragment.from(items), 1, 1);
  }

  replace(tr: Transaction, content: Slice = Slice.empty): void {
    super.replace(tr, content);
  }

  replaceWith(tr: Transaction, node: Node): void {
    super.replaceWith(tr, node);
  }

  toJSON(): { type: 'nodeRange'; anchor: number; head: number } {
    return { type: 'nodeRange', anchor: this.$anchor.pos, head: this.$head.pos };
  }

  static fromJSON(doc: Node, json: { anchor?: unknown; head?: unknown }): NodeRangeSelection {
    if (typeof json.anchor !== 'number' || typeof json.head !== 'number') {
      throw new RangeError('Invalid input for NodeRangeSelection.fromJSON');
    }
    return new NodeRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }

  getBookmark(): SelectionBookmark {
    const a = this.$anchor.pos;
    const h = this.$head.pos;
    return {
      map(mapping: Mappable) {
        return {
          map: this.map,
          resolve(doc: Node) {
            try {
              return new NodeRangeSelection(
                doc.resolve(mapping.map(a)),
                doc.resolve(mapping.map(h)),
              );
            } catch {
              return TextSelection.near(doc.resolve(mapping.map(a)));
            }
          },
        } as SelectionBookmark;
      },
      resolve(doc: Node) {
        try {
          return new NodeRangeSelection(doc.resolve(a), doc.resolve(h));
        } catch {
          return TextSelection.near(doc.resolve(a));
        }
      },
    };
  }
}

Selection.jsonID('nodeRange', NodeRangeSelection);

export function isNodeRangeSelection(sel: Selection): sel is NodeRangeSelection {
  return sel instanceof NodeRangeSelection;
}

// Resolve anchor/head item *before* positions in a shared bullet_list. Returns null when
// the two positions do not share a bullet_list parent.
export function createNodeRangeSelection(
  doc: Node,
  anchorItemPos: number,
  headItemPos: number,
): NodeRangeSelection | null {
  try {
    const $a = doc.resolve(anchorItemPos);
    const $h = doc.resolve(headItemPos);
    if ($a.depth !== $h.depth) return null;
    const parentA = $a.node($a.depth);
    const parentH = $h.node($h.depth);
    if (parentA !== parentH) return null;
    if (parentA.type !== BULLET_LIST) return null;
    const aChild = parentA.maybeChild($a.index($a.depth));
    const hChild = parentH.maybeChild($h.index($h.depth));
    if (!aChild || !hChild) return null;
    if (aChild.type !== LIST_ITEM || hChild.type !== LIST_ITEM) return null;
    return new NodeRangeSelection($a, $h);
  } catch {
    return null;
  }
}
