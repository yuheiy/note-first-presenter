/**
 * The plain-text outline format — `- ` bullets, two-space indent — parse and
 * serialize kept as a pair. The clipboard plugin writes it, the paste plugin
 * reads it back, so a copied range round-trips through any text editor.
 */
import { Fragment, type Node, Slice } from 'prosemirror-model';
import { outlinerSchema } from '../schema';
import { BULLET_LIST, LIST_ITEM, listItem, PARAGRAPH } from './nodes';

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
    return listItem(n.text, nested ?? undefined);
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

export function sliceToIndentedText(slice: Slice): string {
  const lines: string[] = [];
  function walk(content: Fragment, depth: number) {
    content.forEach((child: Node) => {
      if (child.type === LIST_ITEM) {
        const para = child.firstChild;
        const text = para?.type === PARAGRAPH ? para.textContent : '';
        lines.push(`${'  '.repeat(depth)}- ${text}`);
        child.forEach((sub: Node) => {
          if (sub.type === BULLET_LIST) walk(sub.content, depth + 1);
        });
      } else if (child.type === BULLET_LIST) {
        walk(child.content, depth);
      } else if (child.type === PARAGRAPH) {
        lines.push(child.textContent);
      }
    });
  }
  walk(slice.content, 0);
  return lines.join('\n');
}
