import type { Fragment, Node, Slice } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { INTERNAL_MIME } from './paste';

export function sliceToIndentedText(slice: Slice): string {
  const lines: string[] = [];
  function walk(content: Fragment, depth: number) {
    content.forEach((child: Node) => {
      if (child.type.name === 'list_item') {
        const para = child.firstChild;
        const text = para?.type.name === 'paragraph' ? para.textContent : '';
        lines.push(`${'  '.repeat(depth)}- ${text}`);
        child.forEach((sub: Node) => {
          if (sub.type.name === 'bullet_list') walk(sub.content, depth + 1);
        });
      } else if (child.type.name === 'bullet_list') {
        walk(child.content, depth);
      } else if (child.type.name === 'paragraph') {
        lines.push(child.textContent);
      }
    });
  }
  walk(slice.content, 0);
  return lines.join('\n');
}

function writeClipboard(view: import('prosemirror-view').EditorView, event: ClipboardEvent) {
  const { state } = view;
  if (state.selection.empty) return false;
  const slice = state.selection.content();
  if (slice.size === 0) return false;
  const dt = event.clipboardData;
  if (!dt) return false;
  dt.setData(INTERNAL_MIME, JSON.stringify(slice.toJSON()));
  dt.setData('text/plain', sliceToIndentedText(slice));
  event.preventDefault();
  return true;
}

export const clipboardPlugin = new Plugin({
  key: new PluginKey('nfp-clipboard'),
  props: {
    handleDOMEvents: {
      copy(view, event) {
        return writeClipboard(view, event);
      },
      cut(view, event) {
        const wrote = writeClipboard(view, event);
        if (!wrote) return false;
        view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
        return true;
      },
    },
  },
});
