import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';

export const dbInputSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbInput = v.InferOutput<typeof dbInputSchema>;

export function emptyDb(): DbInput {
  return {
    version: 1,
    title: '',
    outline: {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ type: 'paragraph' }] }],
        },
      ],
    },
  };
}

export async function readDb(dbPath: string): Promise<DbInput> {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(text) as DbInput;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb();
    throw err;
  }
}

export async function writeDb(dbPath: string, db: DbInput): Promise<void> {
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}

export interface JsonNode {
  type: string;
  content?: JsonNode[];
  text?: string;
}

/** Text of a list_item's first child, only if that child is a paragraph. */
export function paragraphText(item: JsonNode): string {
  const first = (item.content ?? [])[0];
  if (!first || first.type !== 'paragraph') return '';
  return (first.content ?? []).map((n) => n.text ?? '').join('');
}

/** True for a top-level `---` separator list_item (single paragraph child whose text is exactly "---"). */
export function isSeparatorItem(item: JsonNode): boolean {
  if (item.type !== 'list_item') return false;
  if ((item.content ?? []).length !== 1) return false;
  return paragraphText(item) === '---';
}

/** Extract the top-level bullet_list items from an outline doc, or [] if absent. */
export function docToItems(outline: unknown): JsonNode[] {
  const doc = outline as JsonNode | undefined;
  if (!doc || doc.type !== 'doc') return [];
  const list = doc.content?.[0];
  if (!list || list.type !== 'bullet_list') return [];
  return list.content ?? [];
}

export interface NoteNode {
  text: string;
  children: NoteNode[];
}

function toNode(item: JsonNode): NoteNode {
  const nestedList = (item.content ?? []).find((c) => c.type === 'bullet_list');
  const children = (nestedList?.content ?? []).map(toNode);
  return { text: paragraphText(item), children };
}

export function splitNoteGroups(outline: unknown): NoteNode[][] {
  const items = docToItems(outline);
  const groups: NoteNode[][] = [[]];
  for (const item of items) {
    if (isSeparatorItem(item)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(toNode(item));
  }
  return groups;
}

export function dbPathFor(cwd: string): string {
  return path.join(cwd, '.note-first-presenter.json');
}
