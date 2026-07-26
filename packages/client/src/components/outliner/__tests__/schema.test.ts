import { describe, expect, it } from 'vite-plus/test';
import { outlinerSchema } from '../schema';

describe('outlinerSchema', () => {
  it('builds a doc with bullet_list > list_item > paragraph', () => {
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [
          outlinerSchema.node('paragraph', null, [outlinerSchema.text('hello')]),
        ]),
      ]),
    ]);
    expect(doc.firstChild?.firstChild?.firstChild?.textContent).toBe('hello');
  });

  it('list_item has collapsed attr default false', () => {
    const li = outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]);
    expect(li.attrs.collapsed).toBe(false);
  });

  it('allows nested bullet_list inside list_item', () => {
    const li = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('parent')]),
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [
          outlinerSchema.node('paragraph', null, [outlinerSchema.text('child')]),
        ]),
      ]),
    ]);
    expect(li.childCount).toBe(2);
    expect(li.lastChild?.type.name).toBe('bullet_list');
  });
});
