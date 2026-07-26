import { Slice } from 'prosemirror-model';
import { describe, expect, it } from 'vite-plus/test';
import { sliceToIndentedText } from '../plugins/clipboard';
import { outlinerSchema } from '../schema';

function makeSlice(items: Array<{ text: string; children?: Array<{ text: string }> }>) {
  const list = outlinerSchema.node(
    'bullet_list',
    null,
    items.map((it) => {
      const children = [
        outlinerSchema.node('paragraph', null, it.text ? [outlinerSchema.text(it.text)] : []),
      ];
      if (it.children?.length) {
        children.push(
          outlinerSchema.node(
            'bullet_list',
            null,
            it.children.map((c) =>
              outlinerSchema.node('list_item', null, [
                outlinerSchema.node('paragraph', null, [outlinerSchema.text(c.text)]),
              ]),
            ),
          ),
        );
      }
      return outlinerSchema.node('list_item', null, children);
    }),
  );
  return new Slice(list.content, 0, 0);
}

describe('sliceToIndentedText', () => {
  it('serializes flat items', () => {
    const slice = makeSlice([{ text: 'a' }, { text: 'b' }]);
    expect(sliceToIndentedText(slice)).toBe('- a\n- b');
  });

  it('serializes nested items with two-space indent', () => {
    const slice = makeSlice([
      { text: 'a', children: [{ text: 'a1' }, { text: 'a2' }] },
      { text: 'b' },
    ]);
    expect(sliceToIndentedText(slice)).toBe('- a\n  - a1\n  - a2\n- b');
  });

  it('serializes empty items as a bare dash', () => {
    const slice = makeSlice([{ text: '' }]);
    expect(sliceToIndentedText(slice)).toBe('- ');
  });
});
