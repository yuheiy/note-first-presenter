import { docToItems, isSeparatorItem, paragraphText } from './json-doc';
import type { JsonNode } from './json-doc';
import type { NoteNode } from './types';

function toNode(item: JsonNode): NoteNode {
  const nestedList = (item.content ?? []).find((c) => c.type === 'bullet_list');
  const children = (nestedList?.content ?? []).map(toNode);
  return { text: paragraphText(item), children };
}

export function splitNoteGroups(outline: unknown): NoteNode[][] {
  const items = docToItems(outline);
  const groups: NoteNode[][] = [[]];
  for (const item of items) {
    if (isSeparatorItem(item)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(toNode(item));
  }
  return groups;
}
