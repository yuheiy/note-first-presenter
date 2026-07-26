import type { Transaction } from 'prosemirror-state';
import { outlinerSchema } from '../schema';

const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function emptyItem() {
  return outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]);
}

/**
 * After bulk deletes, walk the doc and drop any empty `bullet_list` nodes so
 * the schema (`bullet_list = list_item+`) stays valid. Also keep the top-level
 * `bullet_list` populated with a single empty item if it would otherwise vanish.
 *
 * Mutates and returns the same transaction.
 */
export function cleanupEmptyBulletLists(tr: Transaction): Transaction {
  let changed = true;
  while (changed) {
    changed = false;
    const emptyPositions: number[] = [];
    tr.doc.descendants((node, pos) => {
      if (node.type === BULLET_LIST && node.childCount === 0) {
        emptyPositions.push(pos);
      }
      return true;
    });
    if (emptyPositions.length === 0) break;
    emptyPositions.sort((a, b) => b - a);
    for (const pos of emptyPositions) {
      const node = tr.doc.nodeAt(pos);
      if (!node || node.type !== BULLET_LIST || node.childCount !== 0) continue;
      tr.delete(pos, pos + node.nodeSize);
      changed = true;
    }
  }

  if (!tr.doc.firstChild || tr.doc.firstChild.type !== BULLET_LIST) {
    tr.replaceWith(0, tr.doc.content.size, outlinerSchema.node('bullet_list', null, [emptyItem()]));
  } else if (tr.doc.firstChild.childCount === 0) {
    tr.replaceWith(
      0,
      tr.doc.firstChild.nodeSize,
      outlinerSchema.node('bullet_list', null, [emptyItem()]),
    );
  }
  return tr;
}
