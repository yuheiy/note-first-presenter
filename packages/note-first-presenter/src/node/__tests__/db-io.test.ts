import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { readDb, writeDb } from '../db-io';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-db-'));
}

describe('db-io', () => {
  it('returns default when file missing', async () => {
    const dir = await makeTmp();
    const dbPath = path.join(dir, '.note-first-presenter.json');
    const db = await readDb(dbPath);
    expect(db.version).toBe(1);
    expect(db.title).toBe('');
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    const dir = await makeTmp();
    const dbPath = path.join(dir, '.note-first-presenter.json');
    await writeDb(dbPath, {
      version: 1,
      title: 'hello',
      outline: { type: 'doc', content: [] },
    });
    const text = await fs.readFile(dbPath, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "title": "hello"');
  });

  it('round-trips through write/read', async () => {
    const dir = await makeTmp();
    const dbPath = path.join(dir, '.note-first-presenter.json');
    const original = {
      version: 1 as const,
      title: 'round',
      outline: { type: 'doc', content: [{ type: 'bullet_list', content: [] }] },
    };
    await writeDb(dbPath, original);
    const loaded = await readDb(dbPath);
    expect(loaded).toEqual(original);
  });
});
