import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import type { NoteNode } from '../../notes';
import { useTempCwd } from '../../../test/_helpers/use-temp-cwd';
import { buildExportContext, exportPage, toHtml, toMarkdown } from '../export';

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
  pageCount: 2,
  slides: [
    { number: 1, width: 800, height: 600, file: '0001.webp' },
    { number: 2, width: 800, height: 600, file: '0002.webp' },
  ],
};

describe('buildExportContext', () => {
  it('pairs slides with note groups and sets relative image paths', () => {
    const groups: NoteNode[][] = [[{ text: 'a', children: [] }], [{ text: 'b', children: [] }]];
    const ctx = buildExportContext({ title: 'Deck', rendered, groups, imageRelDir: 'images' });
    expect(ctx.title).toBe('Deck');
    expect(ctx.slideCount).toBe(2);
    expect(ctx.slides[0]).toMatchObject({
      number: 1,
      image: 'images/0001.webp',
      notes: [{ text: 'a', children: [] }],
    });
    expect(typeof ctx.toMarkdown).toBe('function');
    expect(typeof ctx.toHtml).toBe('function');
  });

  it('pads with dummy (image null) slides when note groups exceed pages', () => {
    const groups: NoteNode[][] = [[], [], []];
    const ctx = buildExportContext({ title: '', rendered, groups, imageRelDir: 'images' });
    expect(ctx.slideCount).toBe(3);
    expect(ctx.slides[2]).toMatchObject({ number: 3, image: null, width: 0, height: 0, notes: [] });
  });

  it('uses empty notes when pages exceed note groups', () => {
    const groups: NoteNode[][] = [[{ text: 'only', children: [] }]];
    const ctx = buildExportContext({ title: '', rendered, groups, imageRelDir: 'images' });
    expect(ctx.slideCount).toBe(2);
    expect(ctx.slides[1].notes).toEqual([]);
    expect(ctx.slides[1].image).toBe('images/0002.webp');
  });
});

const SAMPLE = path.resolve(import.meta.dirname, '../../../test/__fixtures__/sample.pdf');

useTempCwd('nfp-export-');

describe('exportPage', () => {
  it('writes a single output file and slide images', async () => {
    const templatePath = path.resolve('tpl.eta');
    await fs.writeFile(
      templatePath,
      '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<%= it.toMarkdown(s.notes) %>\n<% }) %>',
    );
    const db = { version: 1, title: 'My Deck', outline: { type: 'doc', content: [] } };
    await fs.writeFile('.note-first-presenter.json', JSON.stringify(db));

    const outDir = path.resolve('out');
    const outFile = await exportPage({
      slidesStatus: { kind: 'resolved', path: SAMPLE },
      outDir,
      imageDir: path.join(outDir, 'images'),
      imageRelDir: 'images',
      templatePath,
      extension: 'md',
      name: 'sample',
    });

    expect(outFile).toBe(path.join(outDir, 'sample.md'));
    const body = await fs.readFile(outFile, 'utf8');
    expect(body).toContain('# My Deck');
    expect(body).toContain('![](images/0001.webp)');
    const img = await fs.stat(path.join(outDir, 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('throws a clear error when the template is missing', async () => {
    const outDir = path.resolve('out');
    await expect(
      exportPage({
        slidesStatus: { kind: 'resolved', path: SAMPLE },
        outDir,
        imageDir: path.join(outDir, 'images'),
        imageRelDir: 'images',
        templatePath: path.resolve('nope.eta'),
        extension: 'md',
        name: 'sample',
      }),
    ).rejects.toThrow(/template/i);
  });

  it('renders the built-in HTML template when templatePath is null', async () => {
    const db = { version: 1, title: 'My Deck', outline: { type: 'doc', content: [] } };
    await fs.writeFile('.note-first-presenter.json', JSON.stringify(db));

    const outDir = path.resolve('out');
    const outFile = await exportPage({
      slidesStatus: { kind: 'resolved', path: SAMPLE },
      outDir,
      imageDir: path.join(outDir, 'images'),
      imageRelDir: 'images',
      templatePath: null,
      extension: 'html',
      name: 'sample',
    });

    expect(outFile).toBe(path.join(outDir, 'sample.html'));
    const body = await fs.readFile(outFile, 'utf8');
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('<h1>My Deck</h1>');
    expect(body).toContain('<img src="images/0001.webp"');
  });
});
