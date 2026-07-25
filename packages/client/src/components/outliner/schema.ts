import { Schema } from 'prosemirror-model';

export const outlinerSchema = new Schema({
  nodes: {
    doc: { content: 'bullet_list?' },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    list_item: {
      content: 'paragraph block*',
      attrs: { collapsed: { default: false } },
      parseDOM: [
        {
          tag: 'li',
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return { collapsed: el.dataset.collapsed === 'true' };
          },
        },
      ],
      toDOM(node) {
        return ['li', { 'data-collapsed': String(node.attrs.collapsed) }, 0];
      },
    },
    paragraph: {
      content: 'text*',
      marks: '',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
  marks: {},
});
