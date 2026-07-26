import { promises as fs } from 'node:fs';
import { defaultDb } from '@note-first-presenter/client/dbSchema';
import { describe, expect, it } from 'vite-plus/test';
import { readDb, writeDb } from '../db.ts';
import { withTempCwd } from './helpers.ts';

withTempCwd('nfp-db-');

describe('readDb / writeDb', () => {
  it('returns the client default when file missing', async () => {
    expect(await readDb()).toEqual(defaultDb());
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

  it('rejects when the file contains schema-invalid JSON', async () => {
    await fs.writeFile(
      '.note-first-presenter.json',
      JSON.stringify({ version: 2, name: 'x' }),
      'utf8',
    );
    await expect(readDb()).rejects.toThrow('.note-first-presenter.json');
  });

  it('rejects when the file contains malformed JSON', async () => {
    await fs.writeFile('.note-first-presenter.json', '{ not json', 'utf8');
    await expect(readDb()).rejects.toThrow('.note-first-presenter.json');
  });

  it('does not leave a temp file behind after writing', async () => {
    await writeDb({
      version: 1,
      title: 'tmp-cleanup',
      outline: { type: 'doc', content: [] },
    });
    const files = await fs.readdir('.');
    expect(files).not.toContain('.note-first-presenter.json.tmp');
  });

  it('serializes concurrent writes and ends with the last value', async () => {
    const dbA = {
      version: 1 as const,
      title: 'a',
      outline: { type: 'doc', content: [] },
    };
    const dbB = {
      version: 1 as const,
      title: 'b',
      outline: { type: 'doc', content: [] },
    };
    await Promise.all([writeDb(dbA), writeDb(dbB)]);
    const loaded = await readDb();
    expect(loaded).toEqual(dbB);
  });
});
