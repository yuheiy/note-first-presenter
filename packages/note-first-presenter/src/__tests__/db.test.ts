import { promises as fs } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { emptyDb, readDb, writeDb } from '../db';
import { useTempCwd } from '../../test/_helpers/use-temp-cwd';

useTempCwd('nfp-db-');

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
    const db = await readDb();
    expect(db.version).toBe(1);
    expect(db.title).toBe('');
  });

  it('writes pretty-printed JSON with trailing newline', async () => {
    await writeDb({
      version: 1,
      title: 'hello',
      outline: { type: 'doc', content: [] },
    });
    const text = await fs.readFile('.note-first-presenter.json', 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "title": "hello"');
  });

  it('round-trips through write/read', async () => {
    const original = {
      version: 1 as const,
      title: 'round',
      outline: { type: 'doc', content: [{ type: 'bullet_list', content: [] }] },
    };
    await writeDb(original);
    const loaded = await readDb();
    expect(loaded).toEqual(original);
  });
});
