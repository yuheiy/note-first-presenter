import { Selection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import {
  computeActiveSlide,
  countNoteGroups,
  deriveNoteGroups,
  findGroupPosition,
} from '../noteGroups';
import { outlinerSchema } from '../schema';
import { makeDoc } from './fixtures';

describe('deriveNoteGroups', () => {
  it('empty doc → 1 group', () => {
    const doc = outlinerSchema.node('doc', null);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });

  it('items only → 1 group', () => {
    const doc = makeDoc(['a', 'b']);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });

  it('--- splits into multiple groups', () => {
    const doc = makeDoc(['a', '---', 'b']);
    expect(deriveNoteGroups(doc)).toHaveLength(2);
  });

  it('consecutive --- → 3 groups', () => {
    const doc = makeDoc(['a', '---', '---', 'b']);
    expect(deriveNoteGroups(doc)).toHaveLength(3);
  });

  it('four or more hyphens also split', () => {
    const doc = makeDoc(['a', '----', 'b', '-----']);
    expect(deriveNoteGroups(doc)).toHaveLength(3);
  });
});

describe('computeActiveSlide', () => {
  it('caret in first group → 1', () => {
    const doc = makeDoc(['a', '---', 'b']);
    const sel = TextSelection.create(doc, 2);
    expect(computeActiveSlide(doc, sel)).toBe(1);
  });

  it('caret in second group → 2', () => {
    const doc = makeDoc(['a', '---', 'b']);
    const sel = TextSelection.create(doc, doc.content.size - 2);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });

  it('caret on separator → next slide', () => {
    const doc = makeDoc(['a', '---', 'b']);
    const groups = deriveNoteGroups(doc);
    const separatorGroup = groups[1];
    const sel = TextSelection.create(doc, separatorGroup.rangeStart + 2);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });
});

describe('findGroupPosition', () => {
  it('returns a position whose group matches each slide (round-trip)', () => {
    const doc = makeDoc(['a', '---', 'b', '---', 'c']);
    for (const slide of [1, 2, 3]) {
      const pos = findGroupPosition(doc, slide);
      expect(pos).not.toBeNull();
      const sel = Selection.near(doc.resolve(pos!), 1);
      expect(computeActiveSlide(doc, sel)).toBe(slide);
    }
  });

  it('returns null for an out-of-range slide', () => {
    const doc = makeDoc(['a']);
    expect(findGroupPosition(doc, 2)).toBeNull();
  });
});

describe('countNoteGroups', () => {
  it('applies the same split to the saved JSON shape', () => {
    const li = (text: string) => ({
      type: 'list_item',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const doc = (items: unknown[]) => ({
      type: 'doc',
      content: [{ type: 'bullet_list', content: items }],
    });
    expect(countNoteGroups(doc([li('a'), li('---'), li('b'), li('----'), li('c')]))).toBe(3);
    // Not-quite-separators do not split here either.
    expect(countNoteGroups(doc([li('a'), li('--'), li('--- foo'), li('b')]))).toBe(1);
  });
});
