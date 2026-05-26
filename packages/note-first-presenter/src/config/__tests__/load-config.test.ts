import { describe, expect, it } from 'vite-plus/test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadNfpConfig } from '../load-config';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-config-'));
}

describe('loadNfpConfig', () => {
  it('returns null when no config file exists', async () => {
    const dir = await makeTmp();
    const result = await loadNfpConfig(dir);
    expect(result.config).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it('loads .ts config', async () => {
    const dir = await makeTmp();
    const file = path.join(dir, 'note-first-presenter.config.ts');
    await fs.writeFile(file, `export default { slides: './x.pdf' };`);
    const result = await loadNfpConfig(dir);
    expect(result.config?.slides).toBe('./x.pdf');
    expect(result.filePath).toBe(file);
  });

  it('rejects unknown keys via valibot', async () => {
    const dir = await makeTmp();
    const file = path.join(dir, 'note-first-presenter.config.js');
    await fs.writeFile(file, `export default { invalidKey: true };`);
    await expect(loadNfpConfig(dir)).rejects.toThrow();
  });
});
