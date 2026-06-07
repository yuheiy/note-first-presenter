import { describe, expect, it } from 'vitest';
import { parseHtmlList, parsePlainTextOutline } from '../plugins/paste';

function topLevelTexts(slice: ReturnType<typeof parseHtmlList>) {
  if (!slice) return [];
  const list = slice.content.firstChild!;
  const out: string[] = [];
  list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
  return out;
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

describe('parsePlainTextOutline', () => {
  it('returns null for single line input', () => {
    expect(parsePlainTextOutline('single')).toBeNull();
  });

  it('parses flat bullets', () => {
    const slice = parsePlainTextOutline('- a\n- b');
    expect(topLevelTexts(slice)).toEqual(['a', 'b']);
  });

  it('parses indented bullets into a tree', () => {
    const slice = parsePlainTextOutline('- a\n  - a1\n  - a2\n- b');
    const list = slice!.content.firstChild!;
    expect(list.childCount).toBe(2);
    const first = list.firstChild!;
    expect(first.lastChild!.type.name).toBe('bullet_list');
    expect(first.lastChild!.childCount).toBe(2);
  });

  it('strips numbered prefixes like 1.', () => {
    const slice = parsePlainTextOutline('1. first\n2. second');
    expect(topLevelTexts(slice)).toEqual(['first', 'second']);
  });

  it('handles plain indented text without bullet markers', () => {
    const slice = parsePlainTextOutline('a\n    a1\nb');
    const list = slice!.content.firstChild!;
    expect(list.childCount).toBe(2);
    expect(list.firstChild!.lastChild!.type.name).toBe('bullet_list');
  });
});
