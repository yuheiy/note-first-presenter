import { describe, expect, it } from 'vite-plus/test';
import { buildExportContext } from '../context';
import type { NoteNode } from '../types';

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
