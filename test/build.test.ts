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
}, 60_000); // full production build via the source bin; well over the 10s default hook timeout

afterAll(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('note-first-presenter build (bin integration)', () => {
  // Still one shell for both routes rather than a document per route, plus a
  // copy of it under the name a static host reaches for when it cannot rewrite.
  // In history mode — the default — the slideshow arrives as a fresh
  // `GET /slideshow`, so that copy is what keeps it from 404ing on GitHub Pages
  // (docs/adr/0017).
  it('emits the spa shell and its fallback copy', async () => {
    const shell = await fs.readFile(path.join(tmp, 'dist', 'index.html'), 'utf8');
    expect(await fs.readFile(path.join(tmp, 'dist', '404.html'), 'utf8')).toBe(shell);
    const entries = await fs.readdir(path.join(tmp, 'dist'));
    expect(entries.filter((e) => e.endsWith('.html')).sort()).toEqual(['404.html', 'index.html']);
  });

  // The former "no /api/ string in the bundle" marker for Editor dead-code
  // elimination was dropped here: both modes now read the same `/nfp-data/*`
  // URLs, and GET/PUT share `/nfp-data/db.json`, so no URL string can tell a
  // read from a write.
  //
  // What replaced it is narrower than what it claimed to be. The `static` e2e
  // project asserts that the built site issues no non-GET request and cannot be
  // typed into — the harm the marker was really standing in for. Elimination
  // itself stays UNCOVERED, and deliberately so: it is not one of the guarantees
  // this suite makes, since a bundled-but-unreachable Editor costs bytes and
  // nothing else.

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
