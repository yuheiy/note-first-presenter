import { describe, expect, it } from 'vite-plus/test';
import { toHtml, toMarkdown } from '../format';
import type { NoteNode } from '../types';

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
