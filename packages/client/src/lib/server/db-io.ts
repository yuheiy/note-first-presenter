import { promises as fs } from 'node:fs';
import { type DbV1, defaultDb } from '../db/schema';

export async function readDb(dbPath: string): Promise<DbV1> {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(text) as DbV1;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultDb();
    throw err;
  }
}

export async function writeDb(dbPath: string, db: DbV1): Promise<void> {
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}
