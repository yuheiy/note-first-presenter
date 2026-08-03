import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dbSchema, defaultDb, type DbV1 } from '@note-first-presenter/client/dbSchema';
import * as v from 'valibot';

const DB_FILENAME = '.note-first-presenter.json';

export async function readDb(cwd: string): Promise<DbV1> {
  let text: string;
  try {
    text = await fs.readFile(path.join(cwd, DB_FILENAME), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultDb();
    throw err;
  }
  try {
    return v.parse(dbSchema, JSON.parse(text));
  } catch (err) {
    throw new Error(`Invalid ${DB_FILENAME}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
}

let writeChain: Promise<void> = Promise.resolve();

export function writeDb(cwd: string, db: DbV1): Promise<void> {
  const dbPath = path.join(cwd, DB_FILENAME);
  const run = writeChain.then(async () => {
    const tmp = `${dbPath}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, dbPath);
  });
  // Keep the chain alive even when a write fails so later writes still run.
  writeChain = run.catch(() => {});
  return run;
}
