import { Fragment, type Node, Slice } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

export const INTERNAL_MIME = 'application/x-nfp-outline';

function emptyParagraph() {
  return outlinerSchema.node('paragraph', null);
}

function buildItem(text: string, nested?: Node): Node {
  const para =
    text.length > 0
      ? outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])
      : emptyParagraph();
  const children: Node[] = [para];
  if (nested && nested.childCount > 0) children.push(nested);
  return outlinerSchema.node('list_item', null, children);
}

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
    itemNodes.push(buildItem(text, nested));
  }
  return outlinerSchema.node('bullet_list', null, itemNodes);
}

export function parseHtmlList(html: string): Slice | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('ul, ol');
  if (!root) return null;
  const list = walkHtmlList(root);
  if (list.childCount === 0) return null;
  return new Slice(Fragment.from(list), 0, 0);
}

interface ParsedLine {
  indent: number;
  content: string;
}

function parseLines(text: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const match = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(rawLine);
    if (match) {
      result.push({ indent: match[1].length, content: match[2].trim() });
      continue;
    }
    const indentMatch = /^(\s*)(.*)$/.exec(rawLine)!;
    result.push({ indent: indentMatch[1].length, content: indentMatch[2].trim() });
  }
  return result;
}

function determineUnit(lines: ParsedLine[]): number {
  const nonZero = lines.map((l) => l.indent).filter((i) => i > 0);
  if (nonZero.length === 0) return 1;
  return Math.min(...nonZero);
}

interface TreeNode {
  level: number;
  text: string;
  children: TreeNode[];
}

function buildTree(lines: ParsedLine[], unit: number): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const { indent, content } of lines) {
    const level = Math.round(indent / unit);
    const node: TreeNode = { level, text: content, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    (parent ? parent.children : root).push(node);
    stack.push(node);
  }
  return root;
}

function treeToBulletList(nodes: TreeNode[]): Node | null {
  if (nodes.length === 0) return null;
  const items: Node[] = nodes.map((n) => {
    const nested = treeToBulletList(n.children);
    return buildItem(n.text, nested ?? undefined);
  });
  return outlinerSchema.node('bullet_list', null, items);
}

export function parsePlainTextOutline(text: string): Slice | null {
  const lines = parseLines(text);
  if (lines.length < 2) return null;
  const unit = determineUnit(lines);
  const tree = buildTree(lines, unit);
  const list = treeToBulletList(tree);
  return list ? new Slice(Fragment.from(list), 0, 0) : null;
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
