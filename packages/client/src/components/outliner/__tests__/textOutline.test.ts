import { Slice } from 'prosemirror-model';
import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vite-plus/test';
import { parsePlainTextOutline, sliceToIndentedText } from '../model/textOutline';
import { outlinerSchema } from '../schema';
import { item, itemTexts } from './fixtures';

function makeSlice(items: Node[]) {
  return new Slice(outlinerSchema.node('bullet_list', null, items).content, 0, 0);
}

function topLevelTexts(slice: Slice | null) {
  if (!slice) return [];
  return itemTexts(slice.content.firstChild!);
}

describe('parsePlainTextOutline', () => {
  it('returns null for single line input', () => {
    expect(parsePlainTextOutline('single')).toBeNull();
  });

  it('parses flat bullets', () => {
    expect(topLevelTexts(parsePlainTextOutline('- a\n- b'))).toEqual(['a', 'b']);
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
    expect(topLevelTexts(parsePlainTextOutline('1. first\n2. second'))).toEqual([
      'first',
      'second',
    ]);
  });

  it('handles plain indented text without bullet markers', () => {
    const slice = parsePlainTextOutline('a\n    a1\nb');
    const list = slice!.content.firstChild!;
    expect(list.childCount).toBe(2);
    expect(list.firstChild!.lastChild!.type.name).toBe('bullet_list');
  });
});

describe('sliceToIndentedText', () => {
  it('serializes flat items', () => {
    expect(sliceToIndentedText(makeSlice([item('a'), item('b')]))).toBe('- a\n- b');
  });

  it('serializes nested items with two-space indent', () => {
    const slice = makeSlice([item('a', [item('a1'), item('a2')]), item('b')]);
    expect(sliceToIndentedText(slice)).toBe('- a\n  - a1\n  - a2\n- b');
  });

  it('serializes empty items as a bare dash', () => {
    expect(sliceToIndentedText(makeSlice([item('')]))).toBe('- ');
  });

  it('round-trips what it serialized', () => {
    const slice = makeSlice([item('a', [item('a1')]), item('b')]);
    expect(topLevelTexts(parsePlainTextOutline(sliceToIndentedText(slice)))).toEqual(['a', 'b']);
  });
});
