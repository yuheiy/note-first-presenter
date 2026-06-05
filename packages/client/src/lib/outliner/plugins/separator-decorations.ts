import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { m } from '#lib/paraglide/messages';
import { isTopLevelSeparator } from '../separator';

function compute(doc: Node): DecorationSet {
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') return DecorationSet.empty;
  const decos: Decoration[] = [];
  let slide = 1;
  let offset = 1;
  list.forEach((item) => {
    if (isTopLevelSeparator(item)) {
      const next = slide + 1;
      decos.push(
        Decoration.node(offset, offset + item.nodeSize, {
          'data-separator': 'true',
          'data-next-slide-label': m.next_slide_label({ n: next }),
        }),
      );
      slide = next;
    }
    offset += item.nodeSize;
  });
  return DecorationSet.create(doc, decos);
}

export const separatorDecorations = new Plugin({
  state: {
    init: (_, s) => compute(s.doc),
    apply: (tr, old) => (tr.docChanged ? compute(tr.doc) : old),
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});
