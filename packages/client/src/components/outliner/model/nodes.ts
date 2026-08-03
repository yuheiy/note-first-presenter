import type { Node } from 'prosemirror-model';
import { outlinerSchema } from '../schema';

// The outliner's node types, bound once at module scope. Modules that
// pattern-match on node types import these rather than each re-deriving them
// from the schema.
export const LIST_ITEM = outlinerSchema.nodes.list_item;
export const BULLET_LIST = outlinerSchema.nodes.bullet_list;
export const PARAGRAPH = outlinerSchema.nodes.paragraph;

/**
 * A list_item holding `text` in its paragraph and, when given a non-empty
 * `nested` list, that list as its second child. An empty nested list is
 * dropped rather than attached: `bullet_list = list_item+`, so attaching it
 * would produce an invalid node.
 */
export function listItem(text: string, nested?: Node): Node {
  const paragraph =
    text.length > 0
      ? outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])
      : outlinerSchema.node('paragraph', null);
  const children: Node[] = [paragraph];
  if (nested && nested.childCount > 0) children.push(nested);
  return outlinerSchema.node('list_item', null, children);
}

/** A list_item holding a single empty paragraph — the shape an emptied outline is reset to. */
export function emptyListItem(): Node {
  return listItem('');
}
