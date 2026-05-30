import { promises as fs } from 'node:fs';
import { type DbInput, emptyDb } from './db-schema';

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
