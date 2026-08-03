// HTML parsing only: it needs a real `DOMParser`, which is why this file is a
// browser test. The plain-text half of the paste pipeline is pure and lives in
// `textOutline.test.ts`, in the node project.
import { describe, expect, it } from 'vite-plus/test';
import { parseHtmlList } from '../plugins/paste';
import { itemTexts } from './fixtures';

function topLevelTexts(slice: ReturnType<typeof parseHtmlList>) {
  if (!slice) return [];
  return itemTexts(slice.content.firstChild!);
}

describe('parseHtmlList', () => {
  it('returns null when no ul/ol present', () => {
    expect(parseHtmlList('<p>hello</p>')).toBeNull();
  });

  it('parses a flat ul into list_items', () => {
    const slice = parseHtmlList('<ul><li>a</li><li>b</li></ul>');
    expect(topLevelTexts(slice)).toEqual(['a', 'b']);
  });

  it('preserves nested ul as nested list_item children', () => {
    const slice = parseHtmlList('<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>');
    const list = slice!.content.firstChild!;
    expect(list.childCount).toBe(2);
    const first = list.firstChild!;
    expect(first.childCount).toBe(2);
    expect(first.lastChild!.type.name).toBe('bullet_list');
    expect(first.lastChild!.firstChild!.firstChild!.textContent).toBe('a1');
  });

  it('handles ordered lists the same as unordered', () => {
    const slice = parseHtmlList('<ol><li>a</li><li>b</li></ol>');
    expect(topLevelTexts(slice)).toEqual(['a', 'b']);
  });
});
