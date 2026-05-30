import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runPipelineExport } from '../export';

const SAMPLE = path.resolve(import.meta.dirname, '../../server/__tests__/fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('runPipelineExport', () => {
  it('writes a single output file and slide images', async () => {
    const templatePath = path.join(tmp, 'tpl.eta');
    await fs.writeFile(
      templatePath,
      '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<%= it.toMarkdown(s.notes) %>\n<% }) %>',
    );
    const db = { version: 1, title: 'My Deck', outline: { type: 'doc', content: [] } };
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(dbPath, JSON.stringify(db));

    const outFile = await runPipelineExport({
      slidesPath: SAMPLE,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      outDir: path.join(tmp, 'out'),
      imageDir: path.join(tmp, 'out', 'images'),
      imageRelDir: 'images',
      templatePath,
      extension: 'md',
      name: 'sample',
    });

    expect(outFile).toBe(path.join(tmp, 'out', 'sample.md'));
    const body = await fs.readFile(outFile, 'utf8');
    expect(body).toContain('# My Deck');
    expect(body).toContain('![](images/0001.webp)');
    const img = await fs.stat(path.join(tmp, 'out', 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('throws a clear error when the template is missing', async () => {
    await expect(
      runPipelineExport({
        slidesPath: SAMPLE,
        dbPath: path.join(tmp, 'missing.json'),
        cacheRoot: path.join(tmp, 'cache'),
        outDir: path.join(tmp, 'out'),
        imageDir: path.join(tmp, 'out', 'images'),
        imageRelDir: 'images',
        templatePath: path.join(tmp, 'nope.eta'),
        extension: 'md',
        name: 'sample',
      }),
    ).rejects.toThrow(/template/i);
  });

  it('renders the built-in HTML template when templatePath is null', async () => {
    const db = { version: 1, title: 'My Deck', outline: { type: 'doc', content: [] } };
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(dbPath, JSON.stringify(db));

    const outFile = await runPipelineExport({
      slidesPath: SAMPLE,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      outDir: path.join(tmp, 'out'),
      imageDir: path.join(tmp, 'out', 'images'),
      imageRelDir: 'images',
      templatePath: null,
      extension: 'html',
      name: 'sample',
    });

    expect(outFile).toBe(path.join(tmp, 'out', 'sample.html'));
    const body = await fs.readFile(outFile, 'utf8');
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('<h1>My Deck</h1>');
    expect(body).toContain('<img src="images/0001.webp"');
  });
});
