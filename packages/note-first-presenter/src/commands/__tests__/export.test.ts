import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { freshTempDir } from '../../__tests__/helpers.ts';
import type { NoteNode } from '../../notes.ts';
import { resolveSlides } from '../../slides.ts';
import { buildExportContext, exportAsPage, toHtml, toMarkdown } from '../export.ts';

const notes: NoteNode[] = [
  { text: 'parent', children: [{ text: 'child', children: [] }] },
  { text: 'second', children: [] },
];

describe('toMarkdown', () => {
  it('renders nested bullets with 2-space indent', () => {
    expect(toMarkdown(notes)).toBe('- parent\n  - child\n- second');
    expect(toMarkdown([])).toBe('');
  });
});

describe('toHtml', () => {
  it('renders nested <ul><li> structure', () => {
    expect(toHtml(notes)).toBe('<ul><li>parent<ul><li>child</li></ul></li><li>second</li></ul>');
    expect(toHtml([])).toBe('');
  });
  it('escapes HTML special characters', () => {
    expect(toHtml([{ text: '<b> & "x"', children: [] }])).toBe(
      '<ul><li>&lt;b&gt; &amp; &quot;x&quot;</li></ul>',
    );
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

// What these assert is that the *config* reaches the output — which template
// gets rendered and what the file is called — and that lives in exportAsPage
// rather than in any pure function under it, so there is no seam to test
// instead (docs/adr/0021). It takes a resolved deck, reads the db from the
// given cwd, and writes. slides.test.ts covers renderAll writing the images.
describe('exportAsPage', () => {
  const cwd = freshTempDir('nfp-export-');

  const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');

  async function project(title: string): Promise<void> {
    await fs.copyFile(SAMPLE_PDF, path.join(cwd(), 'slides.pdf'));
    await fs.writeFile(
      path.join(cwd(), '.note-first-presenter.json'),
      JSON.stringify({ version: 1, title, outline: { type: 'doc', content: [] } }),
    );
  }

  function inputs(overrides: { template?: string | null; filename?: string } = {}) {
    return {
      cwd: cwd(),
      slidesStatus: resolveSlides(cwd(), undefined),
      outDir: path.join(cwd(), 'export'),
      assetsDir: path.join(cwd(), 'export', 'assets'),
      assetsRelDir: 'assets',
      template: null,
      filename: 'index.html',
      ...overrides,
    };
  }

  it('renders the built-in HTML template when the config names none', async () => {
    await project('Deck');
    await exportAsPage(inputs());
    const out = await fs.readFile(path.join(cwd(), 'export', 'index.html'), 'utf8');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<h1>Deck</h1>');
    expect(out).toContain('<img src="assets/0001.webp"');
  });

  it('renders a configured template string into the configured filename', async () => {
    await project('Tmpl Deck');
    await exportAsPage(
      inputs({
        template:
          '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<% }) %>',
        filename: 'index.md',
      }),
    );
    const out = await fs.readFile(path.join(cwd(), 'export', 'index.md'), 'utf8');
    expect(out).toContain('# Tmpl Deck');
    expect(out).toContain('![](assets/0001.webp)');
    expect(out).not.toContain('<!DOCTYPE html>');
  });
});
