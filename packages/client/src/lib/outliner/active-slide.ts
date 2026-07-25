import type { Node } from 'prosemirror-model';
import type { Selection } from 'prosemirror-state';
import { isTopLevelSeparator } from './separator';

export interface NoteGroup {
  slideIndex: number;
  itemPositions: number[];
  rangeStart: number;
  rangeEnd: number;
  precedingSeparatorPos: number | null;
}

/**
 * Transaction meta flag marking a caret move that the editor made *because* the
 * active slide changed from outside. The dispatch handler skips reporting such a
 * transaction back through `onActiveSlideChange`, which would otherwise clobber
 * the change's origin — and for an empty note group (see `findGroupPosition`)
 * would report the *previous* group and drag the selection back to it.
 */
export const ACTIVE_SLIDE_ECHO_META = 'nfp-active-slide-echo';

const noteGroupsCache = new WeakMap<Node, NoteGroup[]>();

export function deriveNoteGroups(doc: Node): NoteGroup[] {
  const cached = noteGroupsCache.get(doc);
  if (cached) return cached;
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') {
    const fallback = [
      {
        slideIndex: 1,
        itemPositions: [],
        rangeStart: 0,
        rangeEnd: doc.content.size,
        precedingSeparatorPos: null,
      },
    ];
    noteGroupsCache.set(doc, fallback);
    return fallback;
  }

  const groups: NoteGroup[] = [];
  let current: NoteGroup = {
    slideIndex: 1,
    itemPositions: [],
    rangeStart: 0,
    rangeEnd: 0,
    precedingSeparatorPos: null,
  };
  let offset = 1;
  list.forEach((item) => {
    const itemStart = offset;
    const itemEnd = offset + item.nodeSize;
    if (isTopLevelSeparator(item)) {
      current.rangeEnd = itemStart;
      groups.push(current);
      current = {
        slideIndex: current.slideIndex + 1,
        itemPositions: [],
        rangeStart: itemStart,
        rangeEnd: itemEnd,
        precedingSeparatorPos: itemStart,
      };
    } else {
      current.itemPositions.push(itemStart);
      current.rangeEnd = itemEnd;
    }
    offset = itemEnd;
  });
  groups.push(current);
  noteGroupsCache.set(doc, groups);
  return groups;
}

/**
 * The note group whose range contains the caret. `deriveNoteGroups` always
 * returns at least one group, so this never returns undefined.
 */
export function findActiveGroup(doc: Node, selection: Selection): NoteGroup {
  const groups = deriveNoteGroups(doc);
  const caret = selection.from;
  for (const g of groups) {
    if (caret >= g.rangeStart && caret <= g.rangeEnd) return g;
  }
  return groups.at(-1) ?? groups[0]!;
}

export function computeActiveSlide(doc: Node, selection: Selection): number {
  return findActiveGroup(doc, selection).slideIndex;
}

/**
 * A document position near the start of the note group for `slideIndex`, used to
 * move the caret when the active slide changes from outside the editor. Returns
 * the first content item's position, or the group's range start for an empty
 * group (e.g. between consecutive separators). Returns null when no group has
 * that slide index. Resolve and snap with `Selection.near` before use.
 */
export function findGroupPosition(doc: Node, slideIndex: number): number | null {
  const group = deriveNoteGroups(doc).find((g) => g.slideIndex === slideIndex);
  if (!group) return null;
  return group.itemPositions[0] ?? group.rangeStart;
}
