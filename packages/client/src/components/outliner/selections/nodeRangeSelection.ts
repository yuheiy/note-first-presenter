import { Fragment, type Node, type ResolvedPos, Slice } from 'prosemirror-model';
import {
  Selection,
  type SelectionBookmark,
  SelectionRange,
  TextSelection,
} from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';
import { BULLET_LIST, LIST_ITEM } from '../model/nodes';
import { childItemPos } from '../model/position';

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

/**
 * Resolve two positions that must sit in the same parent bullet_list — the
 * shape every NodeRangeSelection is built over. Answers null, rather than
 * throwing, for positions that fall outside the doc or no longer share a
 * bullet_list parent: every caller is handling positions that may have gone
 * stale (mapped, stored, or lifted), and stale means "not this shape any
 * more", not an error.
 */
export function resolveSharedBulletList(
  doc: Node,
  anchor: number,
  head: number,
): { $anchor: ResolvedPos; $head: ResolvedPos } | null {
  const size = doc.content.size;
  if (anchor < 0 || anchor > size || head < 0 || head > size) return null;
  const $anchor = doc.resolve(anchor);
  const $head = doc.resolve(head);
  if ($anchor.depth !== $head.depth) return null;
  const parent = $anchor.node($anchor.depth);
  if (parent !== $head.node($head.depth)) return null;
  if (parent.type !== BULLET_LIST) return null;
  return { $anchor, $head };
}

/**
 * A whole-item selection over contiguous sibling list_items, restricted to one
 * parent bullet_list at one depth (docs/adr/0004). Subclassing ProseMirror's
 * `Selection` and registering with `Selection.jsonID('nodeRange')` is the
 * point: history, collab and clipboard all round-trip selections through that
 * registry, so range operations ride the existing pipelines for free. The
 * flip side is that this leans on ProseMirror's Selection contract deeply
 * enough that replacing the approach later would be expensive.
 */
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

    const fromPos = childItemPos(parent, parentStart, fromIndex);
    const toPos = childItemPos(parent, parentStart, toIndex) + parent.child(toIndex).nodeSize;

    const $from = $anchor.doc.resolve(fromPos);
    const $to = $anchor.doc.resolve(toPos);
    super($anchor, $head, [new SelectionRange($from, $to)]);
    this.liftedFrom = liftedFrom;
    this.additionalItems = additionalItems;
  }

  override visible = false;

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
    let pos = childItemPos(list, this.parentListPos, this.fromIndex);
    for (let i = this.fromIndex; i <= this.toIndex; i++) {
      const node = list.child(i);
      fn(pos, node, i);
      pos += node.nodeSize;
    }
  }

  // Yield every list_item that should appear highlighted. This combines the
  // primary range with any items from a previous nested range we were
  // promoted out of (liftedFrom) and any non-contiguous items added via
  // Cmd+Click (additionalItems). Items that fall inside one of the primary
  // range's items — or coincide with one exactly — are skipped so no item is
  // painted twice.
  forEachHighlightItem(fn: (pos: number, node: Node) => void): void {
    const mainRanges: Array<[number, number]> = [];
    this.forEachItem((pos, node) => {
      mainRanges.push([pos, pos + node.nodeSize]);
      fn(pos, node);
    });
    const isInsideMain = (pos: number, end: number) =>
      mainRanges.some(([from, to]) => from <= pos && end <= to);

    const doc = this.$anchor.doc;

    const lifted = this.liftedFrom;
    if (lifted) {
      const shared = resolveSharedBulletList(doc, lifted.anchor, lifted.head);
      if (shared) {
        const { $anchor: $a, $head: $h } = shared;
        const parent = $a.node($a.depth);
        const aIdx = $a.index($a.depth);
        const hIdx = $h.index($h.depth);
        const lo = Math.min(aIdx, hIdx);
        const hi = Math.max(aIdx, hIdx);
        let pos = childItemPos(parent, $a.start($a.depth), lo);
        for (let i = lo; i <= hi; i++) {
          const node = parent.child(i);
          const end = pos + node.nodeSize;
          if (!isInsideMain(pos, end)) fn(pos, node);
          pos = end;
        }
      }
    }

    for (const pos of this.additionalItems) {
      if (pos < 0 || pos > doc.content.size) continue;
      const node = doc.nodeAt(pos);
      if (!node || node.type !== LIST_ITEM) continue;
      const end = pos + node.nodeSize;
      if (isInsideMain(pos, end)) continue;
      fn(pos, node);
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
    const shared = resolveSharedBulletList(doc, anchor.pos, head.pos);
    if (!shared) return TextSelection.near(doc.resolve(anchor.pos));
    return new NodeRangeSelection(
      shared.$anchor,
      shared.$head,
      mapLiftedFrom(this.liftedFrom, mapping),
      mapAdditionalItems(this.additionalItems, mapping, doc),
    );
  }

  content(): Slice {
    const items: Node[] = [];
    this.forEachItem((_pos, node) => items.push(node));
    return new Slice(Fragment.from(items), 1, 1);
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
    return new NodeRangeBookmark(
      this.$anchor.pos,
      this.$head.pos,
      this.liftedFrom ? { ...this.liftedFrom } : null,
      Array.from(this.additionalItems),
    );
  }
}

class NodeRangeBookmark implements SelectionBookmark {
  constructor(
    private readonly anchor: number,
    private readonly head: number,
    private readonly lifted: LiftedFrom | null,
    private readonly additional: readonly number[],
  ) {}

  map(mapping: Mappable): NodeRangeBookmark {
    return new NodeRangeBookmark(
      mapping.map(this.anchor),
      mapping.map(this.head),
      mapLiftedFrom(this.lifted, mapping),
      // additionalItems get mapped lazily in resolve() because we need a doc
      // to validate the result's list_item-ness; here we just translate.
      this.additional
        .map((p) => mapping.mapResult(p))
        .filter((r) => !r.deleted)
        .map((r) => r.pos),
    );
  }

  resolve(doc: Node): Selection {
    const size = doc.content.size;
    const inRange = (pos: number) => pos >= 0 && pos <= size;
    if (!inRange(this.anchor) || !inRange(this.head)) {
      return TextSelection.near(doc.resolve(Math.max(0, Math.min(this.anchor, size))));
    }
    return new NodeRangeSelection(
      doc.resolve(this.anchor),
      doc.resolve(this.head),
      this.lifted,
      this.additional,
    );
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

/**
 * Return every list_item position selected by the selection (primary range +
 * additionalItems) in document order. Duplicate positions are removed.
 */
export function collectAllSelectedItemPositions(sel: NodeRangeSelection): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  sel.forEachItem((pos) => {
    if (!seen.has(pos)) {
      seen.add(pos);
      out.push(pos);
    }
  });
  for (const pos of sel.additionalItems) {
    if (!seen.has(pos)) {
      seen.add(pos);
      out.push(pos);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

export function createNodeRangeSelection(
  doc: Node,
  anchorItemPos: number,
  headItemPos: number,
  liftedFrom: LiftedFrom | null = null,
  additionalItems: readonly number[] = [],
): NodeRangeSelection | null {
  const shared = resolveSharedBulletList(doc, anchorItemPos, headItemPos);
  if (!shared) return null;
  const { $anchor, $head } = shared;
  const parent = $anchor.node($anchor.depth);
  const aChild = parent.maybeChild($anchor.index($anchor.depth));
  const hChild = parent.maybeChild($head.index($head.depth));
  if (!aChild || !hChild) return null;
  if (aChild.type !== LIST_ITEM || hChild.type !== LIST_ITEM) return null;
  return new NodeRangeSelection($anchor, $head, liftedFrom, additionalItems);
}
