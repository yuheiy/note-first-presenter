import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadNfpConfig } from '../config.ts';
import { withTempCwd } from './helpers.ts';

withTempCwd('nfp-config-');

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

  // Strict validation is the contract, not an accident of the schema library.
  // Slidev's resolveConfig spreads unknown keys through, coerces a bad
  // colorSchema to 'auto' and never looks at routerMode at all; nfp refuses,
  // because a setting that was silently ignored is indistinguishable from one
  // that worked (docs/adr/0017, docs/adr/0019). These two used to be asserted by
  // running the bin in a child process; the contract they cover is the schema's,
  // and loadNfpConfig is where the schema is applied.
  it('rejects a routerMode outside the picklist', async () => {
    await fs.writeFile('note-first-presenter.config.ts', `export default { routerMode: 'bogus' };`);
    await expect(loadNfpConfig('build')).rejects.toThrow();
  });

  // Caught as a bad *setting* rather than left to fail as a bad file: without
  // this the path reaches pdfjs, which fails with a parse error naming nothing
  // the author can act on (docs/adr/0019).
  it('rejects a slides path whose extension nothing can render', async () => {
    await fs.writeFile('note-first-presenter.config.ts', `export default { slides: 'deck.key' };`);
    await expect(loadNfpConfig('build')).rejects.toThrow(/\.pdf/);
  });
});
