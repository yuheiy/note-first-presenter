import type { Transaction } from 'prosemirror-state';
import { BULLET_LIST, emptyListItem } from '../model/nodes';
import { outlinerSchema } from '../schema';

/**
 * Delete every `bullet_list` the deletes left without children, so the schema
 * (`bullet_list = list_item+`) stays valid. One pass suffices: deleting a
 * bullet_list never removes a list_item, so it cannot empty another list.
 */
function deleteEmptyBulletLists(tr: Transaction): void {
  const emptyPositions: number[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type === BULLET_LIST && node.childCount === 0) {
      emptyPositions.push(pos);
    }
    return true;
  });
  // Back-to-front so earlier positions stay valid.
  emptyPositions.sort((a, b) => b - a);
  for (const pos of emptyPositions) {
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type !== BULLET_LIST || node.childCount !== 0) continue;
    tr.delete(pos, pos + node.nodeSize);
  }
}

/** Keep the top-level `bullet_list` populated with a single empty item if it would otherwise vanish. */
function restoreTopLevelList(tr: Transaction): void {
  if (!tr.doc.firstChild || tr.doc.firstChild.type !== BULLET_LIST) {
    tr.replaceWith(
      0,
      tr.doc.content.size,
      outlinerSchema.node('bullet_list', null, [emptyListItem()]),
    );
  } else if (tr.doc.firstChild.childCount === 0) {
    tr.replaceWith(
      0,
      tr.doc.firstChild.nodeSize,
      outlinerSchema.node('bullet_list', null, [emptyListItem()]),
    );
  }
}

/**
 * Post-delete normalisation for every command that removes list_items in
 * bulk: drop the bullet_lists the deletes emptied, then make sure the doc
 * still opens with a non-empty top-level list.
 *
 * Mutates and returns the same transaction.
 */
export function cleanupAfterBulkDelete(tr: Transaction): Transaction {
  deleteEmptyBulletLists(tr);
  restoreTopLevelList(tr);
  return tr;
}
