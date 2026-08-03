import { Fragment, type Node, Slice } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { listItem } from '../model/nodes';
import { parsePlainTextOutline } from '../model/textOutline';
import { outlinerSchema } from '../schema';

export const INTERNAL_MIME = 'application/x-nfp-outline';

function walkHtmlList(el: Element): Node {
  const itemNodes: Node[] = [];
  const lis = Array.from(el.children).filter((c) => c.tagName === 'LI');
  for (const li of lis) {
    const nestedEl = Array.from(li.children).find((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const textParts: string[] = [];
    for (const node of li.childNodes) {
      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        textParts.push(node.textContent ?? '');
      } else if (node instanceof Element) {
        if (node.tagName !== 'UL' && node.tagName !== 'OL') {
          textParts.push(node.textContent ?? '');
        }
      }
    }
    const text = textParts.join('').replace(/\s+/g, ' ').trim();
    const nested = nestedEl ? walkHtmlList(nestedEl) : undefined;
    itemNodes.push(listItem(text, nested));
  }
  return outlinerSchema.node('bullet_list', null, itemNodes);
}

/** Needs a real DOM (`DOMParser`), unlike the plain-text parser in `model/textOutline.ts`. */
export function parseHtmlList(html: string): Slice | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('ul, ol');
  if (!root) return null;
  const list = walkHtmlList(root);
  if (list.childCount === 0) return null;
  return new Slice(Fragment.from(list), 0, 0);
}

export const pasteHandler = new Plugin({
  key: new PluginKey('nfp-paste'),
  props: {
    handlePaste(view, event) {
      const dt = event.clipboardData;
      if (!dt) return false;
      const internal = dt.getData(INTERNAL_MIME);
      if (internal) {
        try {
          const slice = Slice.fromJSON(outlinerSchema, JSON.parse(internal));
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        } catch {
          // fall through to other formats
        }
      }
      const html = dt.getData('text/html');
      if (html) {
        const slice = parseHtmlList(html);
        if (slice) {
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }
      }
      const text = dt.getData('text/plain');
      if (text && text.includes('\n')) {
        const slice = parsePlainTextOutline(text);
        if (slice) {
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }
      }
      return false;
    },
  },
});
