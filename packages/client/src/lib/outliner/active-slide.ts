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

export function deriveNoteGroups(doc: Node): NoteGroup[] {
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') {
    return [
      {
        slideIndex: 1,
        itemPositions: [],
        rangeStart: 0,
        rangeEnd: doc.content.size,
        precedingSeparatorPos: null,
      },
    ];
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
  return groups;
}

export function computeActiveSlide(doc: Node, selection: Selection): number {
  const groups = deriveNoteGroups(doc);
  const caret = selection.from;
  for (const g of groups) {
    if (caret >= g.rangeStart && caret <= g.rangeEnd) return g.slideIndex;
  }
  return groups.at(-1)?.slideIndex ?? 1;
}
