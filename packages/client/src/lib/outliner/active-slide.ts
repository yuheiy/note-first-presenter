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
