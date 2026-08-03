/**
 * Doc builders and position helpers shared by the outliner's tests. Every doc
 * is the real schema's shape — `doc > bullet_list > list_item > paragraph` —
 * so positions computed here match what the editor produces.
 */
import type { Node } from 'prosemirror-model';
import { outlinerSchema } from '../schema';

/** A list_item holding `text` and, optionally, nested child items. */
export function item(text: string, children?: Node[]): Node {
  const content: Node[] = [
    outlinerSchema.node('paragraph', null, text ? [outlinerSchema.text(text)] : []),
  ];
  if (children && children.length > 0) {
    content.push(outlinerSchema.node('bullet_list', null, children));
  }
  return outlinerSchema.node('list_item', null, content);
}

/** A doc whose top-level bullet_list holds `items`. */
export function docOf(items: Node[]): Node {
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

/** A flat doc: one top-level item per string. */
export function makeDoc(texts: string[]): Node {
  return docOf(texts.map((t) => item(t)));
}

/** Position of the `index`-th top-level item (immediately before its list_item). */
export function itemPos(doc: Node, index: number): number {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

/** The paragraph text of each of a bullet_list's items. */
export function itemTexts(list: Node): string[] {
  const out: string[] = [];
  list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
  return out;
}

/** The paragraph text of each top-level item. */
export function topTexts(doc: Node): string[] {
  return doc.firstChild ? itemTexts(doc.firstChild) : [];
}
