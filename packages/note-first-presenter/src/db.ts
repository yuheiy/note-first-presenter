import { promises as fs } from 'node:fs';
import * as v from 'valibot';

export const dbInputSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbInput = v.InferOutput<typeof dbInputSchema>;

const DB_FILENAME = '.note-first-presenter.json';

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

export async function readDb(): Promise<DbInput> {
  try {
    const text = await fs.readFile(DB_FILENAME, 'utf8');
    return JSON.parse(text) as DbInput;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb();
    throw err;
  }
}

export async function writeDb(db: DbInput): Promise<void> {
  await fs.writeFile(DB_FILENAME, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}
