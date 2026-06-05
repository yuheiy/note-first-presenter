import { describe, expect, it } from 'vite-plus/test';
import type { NoteNode } from '../../notes';
import { buildExportContext, toHtml, toMarkdown } from '../export';

const notes: NoteNode[] = [
  { text: 'parent', children: [{ text: 'child', children: [] }] },
  { text: 'second', children: [] },
];

describe('toMarkdown', () => {
  it('renders nested bullets with 2-space indent', () => {
    expect(toMarkdown(notes)).toBe('- parent\n  - child\n- second');
  });
  it('returns empty string for no notes', () => {
    expect(toMarkdown([])).toBe('');
  });
});

describe('toHtml', () => {
  it('renders nested <ul><li> structure', () => {
    expect(toHtml(notes)).toBe('<ul><li>parent<ul><li>child</li></ul></li><li>second</li></ul>');
  });
  it('escapes HTML special characters', () => {
    expect(toHtml([{ text: '<b> & "x"', children: [] }])).toBe(
      '<ul><li>&lt;b&gt; &amp; &quot;x&quot;</li></ul>',
    );
  });
  it('returns empty string for no notes', () => {
    expect(toHtml([])).toBe('');
  });
});

const rendered = {
  hash: 'h',
  slides: [
    { number: 1, width: 800, height: 600, file: '0001.webp' },
    { number: 2, width: 800, height: 600, file: '0002.webp' },
  ],
};

describe('buildExportContext', () => {
  it('pairs slides with note groups and sets relative image paths', () => {
    const groups: NoteNode[][] = [[{ text: 'a', children: [] }], [{ text: 'b', children: [] }]];
    const ctx = buildExportContext({ title: 'Deck', rendered, groups, assetsRelDir: 'assets' });
    expect(ctx.title).toBe('Deck');
    expect(ctx.slides).toHaveLength(2);
    expect(ctx.slides[0]).toMatchObject({
      number: 1,
      image: 'assets/0001.webp',
      notes: [{ text: 'a', children: [] }],
    });
    expect(ctx.slides[0].notesMarkdown).toBe('- a');
    expect(ctx.slides[0].notesHtml).toBe('<ul><li>a</li></ul>');
  });

  it('pads with dummy (image null) slides when note groups exceed pages', () => {
    const groups: NoteNode[][] = [[], [], []];
    const ctx = buildExportContext({ title: '', rendered, groups, assetsRelDir: 'assets' });
    expect(ctx.slides).toHaveLength(3);
    expect(ctx.slides[2]).toMatchObject({ number: 3, image: null, width: 0, height: 0, notes: [] });
  });

  it('uses empty notes when pages exceed note groups', () => {
    const groups: NoteNode[][] = [[{ text: 'only', children: [] }]];
    const ctx = buildExportContext({ title: '', rendered, groups, assetsRelDir: 'assets' });
    expect(ctx.slides).toHaveLength(2);
    expect(ctx.slides[1].notes).toEqual([]);
    expect(ctx.slides[1].image).toBe('assets/0002.webp');
  });
});
