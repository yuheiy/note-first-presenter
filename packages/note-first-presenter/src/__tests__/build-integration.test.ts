import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const pkgDir = path.resolve(import.meta.dirname, '../..');
const binPath = path.join(pkgDir, 'bin', 'note-first-presenter.mjs');
const SAMPLE = path.resolve(import.meta.dirname, '../node/__tests__/fixtures/sample.pdf');

let tmp: string;

beforeAll(async () => {
  // Ensure the CLI is built so the bin can run.
  execFileSync('vp', ['pack'], { cwd: pkgDir, stdio: 'pipe' });
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-build-int-'));
  await fs.copyFile(SAMPLE, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(
    path.join(tmp, 'note-first-presenter.config.ts'),
    `export default { slides: 'slides.pdf' };\n`,
  );
  execFileSync(process.execPath, [binPath, 'build'], { cwd: tmp, stdio: 'pipe' });
}, 180_000);

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('note-first-presenter build (bin integration)', () => {
  it('emits spa shell with 200.html fallback', async () => {
    await fs.access(path.join(tmp, 'dist', 'index.html'));
    await fs.access(path.join(tmp, 'dist', '200.html'));
  });

  it('writes static nfp-data with resolved meta and slide images', async () => {
    const meta = JSON.parse(
      await fs.readFile(path.join(tmp, 'dist', 'nfp-data', 'meta.json'), 'utf8'),
    );
    expect(meta.status).toBe('resolved');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    await fs.access(path.join(tmp, 'dist', 'nfp-data', 'db.json'));
    await fs.access(path.join(tmp, 'dist', 'nfp-data', 'slides', meta.hash, '0001.webp'));
  });
});
