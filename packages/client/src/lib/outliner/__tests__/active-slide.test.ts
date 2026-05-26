import type { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { computeActiveSlide, deriveNoteGroups } from '../active-slide';
import { outlinerSchema } from '../schema';

function docOf(items: Array<{ text: string }>): Node {
  const list = items.map((it) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, it.text ? [outlinerSchema.text(it.text)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, list)]);
}

describe('deriveNoteGroups', () => {
  it('empty doc → 1 group', () => {
    const doc = outlinerSchema.node('doc', null);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });

  it('items only → 1 group', () => {
    const doc = docOf([{ text: 'a' }, { text: 'b' }]);
    expect(deriveNoteGroups(doc)).toHaveLength(1);
  });

  it('--- splits into multiple groups', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    expect(deriveNoteGroups(doc)).toHaveLength(2);
  });

  it('consecutive --- → 3 groups', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: '---' }, { text: 'b' }]);
    expect(deriveNoteGroups(doc)).toHaveLength(3);
  });
});

describe('computeActiveSlide', () => {
  it('caret in first group → 1', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    const sel = TextSelection.create(doc, 2);
    expect(computeActiveSlide(doc, sel)).toBe(1);
  });

  it('caret in second group → 2', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    const sel = TextSelection.create(doc, doc.content.size - 2);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });

  it('caret on separator → next slide', () => {
    const doc = docOf([{ text: 'a' }, { text: '---' }, { text: 'b' }]);
    const groups = deriveNoteGroups(doc);
    const separatorGroup = groups[1];
    const sel = TextSelection.create(doc, separatorGroup.rangeStart + 2);
    expect(computeActiveSlide(doc, sel)).toBe(2);
  });
});
