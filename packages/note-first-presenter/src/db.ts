import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';

export const dbInputSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbInput = v.InferOutput<typeof dbInputSchema>;

export interface DbOptions {
  cwd?: string;
}

function getDbPath(cwd: string): string {
  return path.join(cwd, '.note-first-presenter.json');
}

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

export async function readDb({ cwd = process.cwd() }: DbOptions = {}): Promise<DbInput> {
  try {
    const text = await fs.readFile(getDbPath(cwd), 'utf8');
    return JSON.parse(text) as DbInput;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb();
    throw err;
  }
}

export async function writeDb(db: DbInput, { cwd = process.cwd() }: DbOptions = {}): Promise<void> {
  await fs.writeFile(getDbPath(cwd), `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}
