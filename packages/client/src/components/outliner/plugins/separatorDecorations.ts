import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isTopLevelSeparator } from '../model/separator';

const key = new PluginKey<DecorationSet>('nfp-separator-decorations');

function compute(doc: Node): DecorationSet {
  const list = doc.firstChild;
  if (!list || list.type.name !== 'bullet_list') return DecorationSet.empty;
  const decos: Decoration[] = [];
  let offset = 1;
  list.forEach((item) => {
    if (isTopLevelSeparator(item)) {
      decos.push(
        Decoration.node(offset, offset + item.nodeSize, {
          'data-separator': 'true',
        }),
      );
    }
    offset += item.nodeSize;
  });
  return DecorationSet.create(doc, decos);
}

export const separatorDecorations = new Plugin({
  key,
  state: {
    init: (_, s) => compute(s.doc),
    apply: (tr, old) => (tr.docChanged ? compute(tr.doc) : old),
  },
  props: {
    decorations(state) {
      return key.getState(state);
    },
  },
});
