import { describe, expect, it } from 'vite-plus/test';
import { countNoteGroups } from '../count-groups';

function li(text: string) {
  return { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}
function doc(items: unknown[]) {
  return { type: 'doc', content: [{ type: 'bullet_list', content: items }] };
}

describe('countNoteGroups', () => {
  it('counts groups split by three or more consecutive hyphens', () => {
    expect(countNoteGroups(doc([li('a'), li('---'), li('b'), li('----'), li('c')]))).toBe(3);
  });

  it('does not count separators with fewer than three hyphens or extra text', () => {
    expect(countNoteGroups(doc([li('a'), li('--'), li('--- foo'), li('b')]))).toBe(1);
  });
});
