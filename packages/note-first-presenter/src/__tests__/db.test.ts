import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { emptyDb, readDb, writeDb } from '../db';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-db-'));
}

describe('emptyDb', () => {
  it('returns an empty title and a single empty list_item', () => {
    expect(emptyDb()).toEqual({
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
    });
  });
});

describe('readDb / writeDb', () => {
  it('returns default when file missing', async () => {
    const cwd = await makeTmp();
    const db = await readDb({ cwd });
    expect(db.version).toBe(1);
    expect(db.title).toBe('');
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    const cwd = await makeTmp();
    await writeDb(
      {
        version: 1,
        title: 'hello',
        outline: { type: 'doc', content: [] },
      },
      { cwd },
    );
    const text = await fs.readFile(path.join(cwd, '.note-first-presenter.json'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "title": "hello"');
  });

  it('round-trips through write/read', async () => {
    const cwd = await makeTmp();
    const original = {
      version: 1 as const,
      title: 'round',
      outline: { type: 'doc', content: [{ type: 'bullet_list', content: [] }] },
    };
    await writeDb(original, { cwd });
    const loaded = await readDb({ cwd });
    expect(loaded).toEqual(original);
  });
});
