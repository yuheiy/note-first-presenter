import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { sliceToIndentedText } from '../model/textOutline';
import { INTERNAL_MIME } from './paste';

function writeClipboard(view: EditorView, event: ClipboardEvent) {
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
