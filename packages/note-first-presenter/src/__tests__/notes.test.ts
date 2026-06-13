import { describe, expect, it } from 'vite-plus/test';
import { splitNoteGroups } from '../notes';

function li(text: string, children: unknown[] = []) {
  const content: unknown[] = [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }];
  if (children.length) content.push({ type: 'bullet_list', content: children });
  return { type: 'list_item', content };
}
function doc(items: unknown[]) {
  return { type: 'doc', content: items.length ? [{ type: 'bullet_list', content: items }] : [] };
}
const SEP = li('---');

describe('splitNoteGroups', () => {
  it('returns a single empty group for empty outline', () => {
    expect(splitNoteGroups(doc([]))).toEqual([[]]);
  });

  it('maps top-level items to one group with text and nested children', () => {
    const groups = splitNoteGroups(doc([li('intro', [li('point a'), li('point b')])]));
    expect(groups).toEqual([
      [
        {
          text: 'intro',
          children: [
            { text: 'point a', children: [] },
            { text: 'point b', children: [] },
          ],
        },
      ],
    ]);
  });

  it('splits on a standalone --- separator and drops the separator node', () => {
    const groups = splitNoteGroups(doc([li('slide one'), SEP, li('slide two')]));
    expect(groups).toEqual([
      [{ text: 'slide one', children: [] }],
      [{ text: 'slide two', children: [] }],
    ]);
  });

  it('splits on three or more consecutive hyphens', () => {
    const groups = splitNoteGroups(doc([li('a'), li('----'), li('b'), li('-----'), li('c')]));
    expect(groups).toEqual([
      [{ text: 'a', children: [] }],
      [{ text: 'b', children: [] }],
      [{ text: 'c', children: [] }],
    ]);
  });

  it('does not split on fewer than three hyphens or hyphens with other text', () => {
    const groups = splitNoteGroups(doc([li('a'), li('--'), li('--- foo'), li('b')]));
    expect(groups).toEqual([
      [
        { text: 'a', children: [] },
        { text: '--', children: [] },
        { text: '--- foo', children: [] },
        { text: 'b', children: [] },
      ],
    ]);
  });

  it('yields an empty group between consecutive separators', () => {
    const groups = splitNoteGroups(doc([li('a'), SEP, SEP, li('b')]));
    expect(groups).toEqual([[{ text: 'a', children: [] }], [], [{ text: 'b', children: [] }]]);
  });
});
