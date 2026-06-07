import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const SAMPLE_PDF = path.resolve(import.meta.dirname, 'fixtures/sample.pdf');

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-bin-'));
  await fs.copyFile(SAMPLE_PDF, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(
    path.join(tmp, 'note-first-presenter.config.ts'),
    `export default { slides: 'slides.pdf' };\n`,
  );
  execFileSync('note-first-presenter', ['export'], { cwd: tmp, stdio: 'pipe' });
});

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('note-first-presenter export (bin integration, built-in template)', () => {
  it('renders the built-in HTML template without a configured template', async () => {
    const out = await fs.readFile(path.join(tmp, 'export', 'index.html'), 'utf8');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<h1>Deck</h1>');
    expect(out).toContain('<img src="assets/0001.webp"');
  });

  it('writes slide images alongside the export', async () => {
    const img = await fs.stat(path.join(tmp, 'export', 'assets', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });
});

describe('note-first-presenter export (bin integration, configured template string)', () => {
  let tmplTmp: string;

  beforeAll(async () => {
    tmplTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-tmpl-'));
    await fs.copyFile(SAMPLE_PDF, path.join(tmplTmp, 'slides.pdf'));
    await fs.writeFile(
      path.join(tmplTmp, '.note-first-presenter.json'),
      JSON.stringify({ version: 1, title: 'Tmpl Deck', outline: { type: 'doc', content: [] } }),
    );
    const template =
      '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<% }) %>';
    await fs.writeFile(
      path.join(tmplTmp, 'note-first-presenter.config.ts'),
      `export default { slides: 'slides.pdf', export: { filename: 'index.md', template: ${JSON.stringify(template)} } };\n`,
    );
    execFileSync('note-first-presenter', ['export'], { cwd: tmplTmp, stdio: 'pipe' });
  });

  afterAll(async () => {
    if (tmplTmp) await fs.rm(tmplTmp, { recursive: true, force: true });
  });

  it('renders the configured eta template string into .md output', async () => {
    const out = await fs.readFile(path.join(tmplTmp, 'export', 'index.md'), 'utf8');
    expect(out).toContain('# Tmpl Deck');
    expect(out).toContain('![](assets/0001.webp)');
    expect(out).not.toContain('<!DOCTYPE html>');
  });
});
