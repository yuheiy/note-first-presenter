import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultDb } from '@note-first-presenter/client/dbSchema';
import { describe, expect, it } from 'vite-plus/test';
import { readDb, writeDb } from '../db.ts';
import { freshTempDir } from './helpers.ts';

const cwd = freshTempDir('nfp-db-');

describe('readDb / writeDb', () => {
  it('returns the client default when file missing', async () => {
    expect(await readDb(cwd())).toEqual(defaultDb());
  });

  // The file is meant to be committed, so the written form has to stay stable
  // and readable in a git diff: pretty-printed, trailing newline.
  it('writes a git-diffable form', async () => {
    await writeDb(cwd(), {
      version: 1,
      title: 'hello',
      outline: { type: 'doc', content: [] },
    });
    const text = await fs.readFile(path.join(cwd(), '.note-first-presenter.json'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "title": "hello"');
  });

  it('round-trips through write/read, leaving no temp file behind', async () => {
    const original = {
      version: 1 as const,
      title: 'round',
      outline: { type: 'doc', content: [{ type: 'bullet_list', content: [] }] },
    };
    await writeDb(cwd(), original);
    expect(await readDb(cwd())).toEqual(original);
    // The write goes through a `.tmp` sibling and renames it into place.
    expect(await fs.readdir(cwd())).toEqual(['.note-first-presenter.json']);
  });

  it('rejects when the file contains schema-invalid JSON', async () => {
    await fs.writeFile(
      path.join(cwd(), '.note-first-presenter.json'),
      JSON.stringify({ version: 2, name: 'x' }),
      'utf8',
    );
    await expect(readDb(cwd())).rejects.toThrow('.note-first-presenter.json');
  });

  it('rejects when the file contains malformed JSON', async () => {
    await fs.writeFile(path.join(cwd(), '.note-first-presenter.json'), '{ not json', 'utf8');
    await expect(readDb(cwd())).rejects.toThrow('.note-first-presenter.json');
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
    await Promise.all([writeDb(cwd(), dbA), writeDb(cwd(), dbB)]);
    const loaded = await readDb(cwd());
    expect(loaded).toEqual(dbB);
  });
});
