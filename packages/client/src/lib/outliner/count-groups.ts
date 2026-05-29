import { docToItems, isSeparatorItem } from './json-doc';

export function countNoteGroups(outline: unknown): number {
  const items = docToItems(outline);
  let separators = 0;
  for (const item of items) {
    if (isSeparatorItem(item)) separators++;
  }
  return separators + 1;
}
