import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { dbPathFor, emptyDb, readDb, splitNoteGroups, writeDb } from '../notes';

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

function li(text: string, children: unknown[] = []) {
  const content: unknown[] = [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }];
  if (children.length) content.push({ type: 'bullet_list', content: children });
  return { type: 'list_item', content };
}
function doc(items: unknown[]) {
  return { type: 'doc', content: items.length ? [{ type: 'bullet_list', content: items }] : [] };
}
const SEP = li('---');

describe('splitNoteGroups', () => {
  it('returns a single empty group for empty outline', () => {
    expect(splitNoteGroups(doc([]))).toEqual([[]]);
  });

  it('maps top-level items to one group with text and nested children', () => {
    const groups = splitNoteGroups(doc([li('intro', [li('point a'), li('point b')])]));
    expect(groups).toEqual([
      [
        {
          text: 'intro',
          children: [
            { text: 'point a', children: [] },
            { text: 'point b', children: [] },
          ],
        },
      ],
    ]);
  });

  it('splits on a standalone --- separator and drops the separator node', () => {
    const groups = splitNoteGroups(doc([li('slide one'), SEP, li('slide two')]));
    expect(groups).toEqual([
      [{ text: 'slide one', children: [] }],
      [{ text: 'slide two', children: [] }],
    ]);
  });

  it('yields an empty group between consecutive separators', () => {
    const groups = splitNoteGroups(doc([li('a'), SEP, SEP, li('b')]));
    expect(groups).toEqual([[{ text: 'a', children: [] }], [], [{ text: 'b', children: [] }]]);
  });
});

describe('dbPathFor', () => {
  it('returns <cwd>/.note-first-presenter.json', () => {
    expect(dbPathFor('/proj')).toBe('/proj/.note-first-presenter.json');
  });
});
