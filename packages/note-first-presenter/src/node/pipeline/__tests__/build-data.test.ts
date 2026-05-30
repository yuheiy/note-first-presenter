import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { writeBuildData } from '../build-data';

const SAMPLE = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-builddata-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeBuildData', () => {
  it('writes db.json, meta.json and per-page webp under nfp-data', async () => {
    const db = { version: 1, title: 'T', outline: { type: 'doc', content: [] } };
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(dbPath, JSON.stringify(db));
    const outDir = path.join(tmp, 'dist');

    await writeBuildData({
      outDir,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      slidesStatus: { kind: 'resolved', path: SAMPLE },
    });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.status).toBe('resolved');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    const savedDb = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'db.json'), 'utf8'));
    expect(savedDb.title).toBe('T');
    const img = await fs.stat(path.join(outDir, 'nfp-data', 'slides', meta.hash, '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('writes only meta.json status when slides are not resolved', async () => {
    const dbPath = path.join(tmp, '.note-first-presenter.json');
    await fs.writeFile(
      dbPath,
      JSON.stringify({ version: 1, title: '', outline: { type: 'doc', content: [] } }),
    );
    const outDir = path.join(tmp, 'dist');

    await writeBuildData({
      outDir,
      dbPath,
      cacheRoot: path.join(tmp, 'cache'),
      slidesStatus: { kind: 'no-config-no-file' },
    });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.kind).toBe('no-config-no-file');
  });
});
