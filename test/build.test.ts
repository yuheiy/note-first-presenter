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
  // No 200.html any more: the pages route off location.hash, which never
  // reaches the server, so index.html is the only document a static host needs.
  it('emits the spa shell', async () => {
    await fs.access(path.join(tmp, 'dist', 'index.html'));
  });

  // The former "no /api/ string in the bundle" marker for Editor dead-code
  // elimination was dropped here: both modes now read the same `/nfp-data/*`
  // URLs, and GET/PUT share `/nfp-data/db.json`, so no URL string can tell a
  // read from a write. Editor DCE is therefore UNCOVERED until the static e2e
  // project asserts it behaviourally (no non-GET request against the built
  // site) — see plans/react-rewrite-spec.md §8.8, scheduled for R6.

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
