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

/**
 * Snapshot of a selection the current NodeRangeSelection was promoted from,
 * stored so the reverse direction can restore it. Forms a linked list so
 * stacked promotions can be peeled back one layer at a time.
 */
export interface LiftedFrom {
  anchor: number;
  head: number;
  /** Direction of the promotion that produced the current selection. */
  fromDirection: -1 | 1;
  /** Snapshot prior to this promotion; null for the first lift in a chain. */
  previous: LiftedFrom | null;
}

export interface NodeRangeSelectionJSON {
  type: 'nodeRange';
  anchor: number;
  head: number;
  liftedFrom?: LiftedFrom;
  additionalItems?: number[];
}

export class NodeRangeSelection extends Selection {
  readonly liftedFrom: LiftedFrom | null;
  /**
   * Positions of additional list_items selected via Cmd/Ctrl+Click that live
   * outside the primary contiguous range. They are highlighted together with
   * the main range and survive map / serialization.
   */
  readonly additionalItems: readonly number[];

  constructor(
    $anchor: ResolvedPos,
    $head: ResolvedPos,
    liftedFrom: LiftedFrom | null = null,
    additionalItems: readonly number[] = [],
  ) {
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

    const $from = $anchor.doc.resolve(fromPos);
    const $to = $anchor.doc.resolve(toPos);
    super($anchor, $head, [new SelectionRange($from, $to)]);
    this.liftedFrom = liftedFrom;
    this.additionalItems = additionalItems;
  }

  override get visible(): boolean {
    return false;
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

  // Yield every list_item that should appear highlighted. This combines the
  // primary range with any items from a previous nested range we were
  // promoted out of (liftedFrom) and any non-contiguous items added via
  // Cmd+Click (additionalItems). Items that already fall inside one of the
  // primary range's items are skipped so a parent and its nested origin
  // don't get painted twice.
  forEachHighlightItem(fn: (pos: number, node: Node) => void): void {
    const mainRanges: Array<[number, number]> = [];
    this.forEachItem((pos, node) => {
      mainRanges.push([pos, pos + node.nodeSize]);
      fn(pos, node);
    });
    const isInsideMain = (pos: number, end: number) =>
      mainRanges.some(([from, to]) => from < pos && end <= to);

    const doc = this.$anchor.doc;

    const lifted = this.liftedFrom;
    if (lifted) {
      try {
        const $a = doc.resolve(lifted.anchor);
        const $h = doc.resolve(lifted.head);
        if (
          $a.depth === $h.depth &&
          $a.node($a.depth) === $h.node($h.depth) &&
          $a.node($a.depth).type === BULLET_LIST
        ) {
          const parent = $a.node($a.depth);
          const aIdx = $a.index($a.depth);
          const hIdx = $h.index($h.depth);
          const lo = Math.min(aIdx, hIdx);
          const hi = Math.max(aIdx, hIdx);
          let pos = $a.start($a.depth);
          for (let i = 0; i < lo; i++) pos += parent.child(i).nodeSize;
          for (let i = lo; i <= hi; i++) {
            const node = parent.child(i);
            const end = pos + node.nodeSize;
            if (!isInsideMain(pos, end)) fn(pos, node);
            pos = end;
          }
        }
      } catch {
        /* lifted positions no longer resolve cleanly — skip */
      }
    }

    for (const pos of this.additionalItems) {
      try {
        const node = doc.nodeAt(pos);
        if (!node || node.type !== LIST_ITEM) continue;
        const end = pos + node.nodeSize;
        if (isInsideMain(pos, end)) continue;
        fn(pos, node);
      } catch {
        /* skip unresolvable */
      }
    }
  }

  eq(other: Selection): boolean {
    if (!(other instanceof NodeRangeSelection)) return false;
    if (other.$anchor.pos !== this.$anchor.pos || other.$head.pos !== this.$head.pos) return false;
    if (!liftedFromEq(this.liftedFrom, other.liftedFrom)) return false;
    if (other.additionalItems.length !== this.additionalItems.length) return false;
    for (let i = 0; i < this.additionalItems.length; i++) {
      if (other.additionalItems[i] !== this.additionalItems[i]) return false;
    }
    return true;
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
      return new NodeRangeSelection(
        $a,
        $h,
        mapLiftedFrom(this.liftedFrom, mapping),
        mapAdditionalItems(this.additionalItems, mapping, doc),
      );
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

  toJSON(): NodeRangeSelectionJSON {
    const json: NodeRangeSelectionJSON = {
      type: 'nodeRange',
      anchor: this.$anchor.pos,
      head: this.$head.pos,
    };
    if (this.liftedFrom) json.liftedFrom = { ...this.liftedFrom };
    if (this.additionalItems.length > 0) json.additionalItems = Array.from(this.additionalItems);
    return json;
  }

  static fromJSON(
    doc: Node,
    json: {
      anchor?: unknown;
      head?: unknown;
      liftedFrom?: unknown;
      additionalItems?: unknown;
    },
  ): NodeRangeSelection {
    if (typeof json.anchor !== 'number' || typeof json.head !== 'number') {
      throw new RangeError('Invalid input for NodeRangeSelection.fromJSON');
    }
    const lifted = parseLiftedFrom(json.liftedFrom);
    const additional = Array.isArray(json.additionalItems)
      ? json.additionalItems.filter((n): n is number => typeof n === 'number')
      : [];
    return new NodeRangeSelection(
      doc.resolve(json.anchor),
      doc.resolve(json.head),
      lifted,
      additional,
    );
  }

  getBookmark(): SelectionBookmark {
    const a = this.$anchor.pos;
    const h = this.$head.pos;
    const lifted = this.liftedFrom ? { ...this.liftedFrom } : null;
    const additional = Array.from(this.additionalItems);
    return {
      map(mapping: Mappable) {
        return {
          map: this.map,
          resolve(doc: Node) {
            try {
              return new NodeRangeSelection(
                doc.resolve(mapping.map(a)),
                doc.resolve(mapping.map(h)),
                mapLiftedFrom(lifted, mapping),
                mapAdditionalItems(additional, mapping, doc),
              );
            } catch {
              return TextSelection.near(doc.resolve(mapping.map(a)));
            }
          },
        } as SelectionBookmark;
      },
      resolve(doc: Node) {
        try {
          return new NodeRangeSelection(doc.resolve(a), doc.resolve(h), lifted, additional);
        } catch {
          return TextSelection.near(doc.resolve(a));
        }
      },
    };
  }
}

function liftedFromEq(a: LiftedFrom | null, b: LiftedFrom | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.anchor !== b.anchor || a.head !== b.head || a.fromDirection !== b.fromDirection)
    return false;
  return liftedFromEq(a.previous, b.previous);
}

function mapAdditionalItems(items: readonly number[], mapping: Mappable, doc: Node): number[] {
  const out: number[] = [];
  for (const pos of items) {
    const result = mapping.mapResult(pos);
    if (result.deleted) continue;
    const node = doc.nodeAt(result.pos);
    if (node && node.type === LIST_ITEM) out.push(result.pos);
  }
  return out;
}

function mapLiftedFrom(lifted: LiftedFrom | null, mapping: Mappable): LiftedFrom | null {
  if (!lifted) return null;
  const a = mapping.mapResult(lifted.anchor);
  const h = mapping.mapResult(lifted.head);
  // If this layer's positions died but its previous can still be mapped,
  // keep peeling so the chain doesn't collapse entirely.
  const previous = mapLiftedFrom(lifted.previous, mapping);
  if (a.deleted || h.deleted) return previous;
  return {
    anchor: a.pos,
    head: h.pos,
    fromDirection: lifted.fromDirection,
    previous,
  };
}

function parseLiftedFrom(raw: unknown): LiftedFrom | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.anchor !== 'number') return null;
  if (typeof obj.head !== 'number') return null;
  if (obj.fromDirection !== -1 && obj.fromDirection !== 1) return null;
  return {
    anchor: obj.anchor,
    head: obj.head,
    fromDirection: obj.fromDirection,
    previous: parseLiftedFrom(obj.previous),
  };
}

// Guard against duplicate registration during Vite HMR re-evaluation.
const NFP_NODE_RANGE_JSON_ID = '__nfp_node_range_json_id__';
interface NfpGlobal {
  [NFP_NODE_RANGE_JSON_ID]?: boolean;
}
const globalRef = globalThis as unknown as NfpGlobal;
if (!globalRef[NFP_NODE_RANGE_JSON_ID]) {
  Selection.jsonID('nodeRange', NodeRangeSelection);
  globalRef[NFP_NODE_RANGE_JSON_ID] = true;
}

export function isNodeRangeSelection(sel: Selection): sel is NodeRangeSelection {
  return sel instanceof NodeRangeSelection;
}

export function createNodeRangeSelection(
  doc: Node,
  anchorItemPos: number,
  headItemPos: number,
  liftedFrom: LiftedFrom | null = null,
  additionalItems: readonly number[] = [],
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
    return new NodeRangeSelection($a, $h, liftedFrom, additionalItems);
  } catch {
    return null;
  }
}
