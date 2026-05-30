import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runExport } from '../export';

const SAMPLE = path.resolve(
  import.meta.dirname,
  '../../../client/src/lib/server/__tests__/fixtures/sample.pdf',
);
let tmp: string;
let origCwd: string;

beforeEach(async () => {
  origCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-int-'));
  await fs.copyFile(SAMPLE, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(path.join(tmp, 'tpl.eta'), '# <%= it.title %> (<%= it.slideCount %>)');
  await fs.writeFile(
    path.join(tmp, 'note-first-presenter.config.ts'),
    `export default { slides: 'slides.pdf', export: { format: { template: 'tpl.eta', extension: 'md' } } };\n`,
  );
  process.chdir(tmp);
});
afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('runExport (integration)', () => {
  it('renders the configured template into export/<name>.<ext>', async () => {
    await runExport({});
    const out = await fs.readFile(path.join(tmp, 'export', 'slides.md'), 'utf8');
    expect(out).toContain('# Deck');
    const img = await fs.stat(path.join(tmp, 'export', 'images', '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });
});
