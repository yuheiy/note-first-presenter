import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { SAMPLE_PDF } from '../../../test/_helpers/fixtures';
import { useTempCwd } from '../../../test/_helpers/use-temp-cwd';
import { writeBuildData } from '../build';

useTempCwd('nfp-builddata-');

describe('writeBuildData', () => {
  it('writes db.json, meta.json and per-page webp under nfp-data', async () => {
    const db = { version: 1, title: 'T', outline: { type: 'doc', content: [] } };
    await fs.writeFile('.note-first-presenter.json', JSON.stringify(db));
    const outDir = path.resolve('dist');

    await writeBuildData({ outDir, slidesStatus: { kind: 'resolved', path: SAMPLE_PDF } });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.status).toBe('resolved');
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    const savedDb = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'db.json'), 'utf8'));
    expect(savedDb.title).toBe('T');
    const img = await fs.stat(path.join(outDir, 'nfp-data', 'slides', meta.hash, '0001.webp'));
    expect(img.size).toBeGreaterThan(0);
  });

  it('writes only meta.json status when slides are not resolved', async () => {
    await fs.writeFile(
      '.note-first-presenter.json',
      JSON.stringify({ version: 1, title: '', outline: { type: 'doc', content: [] } }),
    );
    const outDir = path.resolve('dist');

    await writeBuildData({ outDir, slidesStatus: { kind: 'no-config-no-file' } });

    const meta = JSON.parse(await fs.readFile(path.join(outDir, 'nfp-data', 'meta.json'), 'utf8'));
    expect(meta.kind).toBe('no-config-no-file');
  });
});
