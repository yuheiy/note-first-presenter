import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const SAMPLE_PDF = path.resolve(import.meta.dirname, 'fixtures/sample.pdf');

let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-build-int-'));
  await fs.copyFile(SAMPLE_PDF, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(
    path.join(tmp, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  await fs.writeFile(
    path.join(tmp, 'note-first-presenter.config.ts'),
    `export default { slides: 'slides.pdf' };\n`,
  );
  execFileSync('note-first-presenter', ['build'], { cwd: tmp, stdio: 'pipe' });
});

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('note-first-presenter build (bin integration)', () => {
  it('emits spa shell with 200.html fallback', async () => {
    await fs.access(path.join(tmp, 'dist', '200.html'));
  });

  it('ships no live API path in the static bundle (Editor is dead-code-eliminated)', async () => {
    const appDir = path.join(tmp, 'dist', '_app');
    const jsFiles: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (entry.name.endsWith('.js')) jsFiles.push(p);
      }
    };
    await walk(appDir);
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const src = await fs.readFile(file, 'utf8');
      expect(src, `${path.relative(tmp, file)} references the live API`).not.toContain('/api/');
    }
  });

  it('writes static nfp-data with resolved meta and slide images', async () => {
    const meta = JSON.parse(
      await fs.readFile(path.join(tmp, 'dist', 'nfp-data', 'meta.json'), 'utf8'),
    );
    expect(meta.kind).toBe('resolved');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    await fs.access(path.join(tmp, 'dist', 'nfp-data', 'db.json'));
    await fs.access(path.join(tmp, 'dist', 'nfp-data', 'slides', meta.hash, '0001.webp'));
  });
});
