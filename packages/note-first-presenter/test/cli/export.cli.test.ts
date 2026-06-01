import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const pkgDir = path.resolve(import.meta.dirname, '../..');
const binPath = path.join(pkgDir, 'bin', 'note-first-presenter.mjs');
const SAMPLE = path.resolve(import.meta.dirname, '../__fixtures__/sample.pdf');

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-bin-'));
  await fs.copyFile(SAMPLE, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(
    path.join(tmp, 'note-first-presenter.config.ts'),
    `export default { slides: 'slides.pdf' };\n`,
  );
  // No --template flag and no configured template: exercises the built-in
  // default template, which must be bundled into the packed bin.
  execFileSync(process.execPath, [binPath, 'export'], { cwd: tmp, stdio: 'pipe' });
}, 180_000);

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('note-first-presenter export (bin integration, built-in template)', () => {
  it('renders the built-in HTML template without a configured template file', async () => {
    const out = await fs.readFile(path.join(tmp, 'export', 'slides.html'), 'utf8');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<h1>Deck</h1>');
    expect(out).toContain('<img src="images/0001.webp"');
  });

  it('writes slide images alongside the export', async () => {
    const img = await fs.stat(path.join(tmp, 'export', 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });
});
