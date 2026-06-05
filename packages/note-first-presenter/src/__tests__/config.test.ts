import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadNfpConfig } from '../config';
import { useTempCwd } from './helpers';

useTempCwd('nfp-config-');

describe('loadNfpConfig', () => {
  it('returns null when no config file exists', async () => {
    const result = await loadNfpConfig('dev');
    expect(result.config).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it('loads .ts config', async () => {
    await fs.writeFile('note-first-presenter.config.ts', `export default { slides: './x.pdf' };`);
    const result = await loadNfpConfig('dev');
    expect(result.config?.slides).toBe('./x.pdf');
    expect(result.filePath).toBe(path.resolve('note-first-presenter.config.ts'));
  });

  it('rejects unknown keys via valibot', async () => {
    await fs.writeFile('note-first-presenter.config.js', `export default { invalidKey: true };`);
    await expect(loadNfpConfig('dev')).rejects.toThrow();
  });
});
