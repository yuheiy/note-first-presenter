import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadNfpConfig } from '../config.ts';
import { freshTempDir } from './helpers.ts';

const cwd = freshTempDir('nfp-config-');

describe('loadNfpConfig', () => {
  it('returns null when no config file exists', async () => {
    const result = await loadNfpConfig(cwd(), 'dev');
    expect(result.config).toBeNull();
    expect(result.filePath).toBeNull();
  });

  it('loads .ts config', async () => {
    await fs.writeFile(
      path.join(cwd(), 'note-first-presenter.config.ts'),
      `export default { slides: './x.pdf' };`,
    );
    const result = await loadNfpConfig(cwd(), 'dev');
    expect(result.config?.slides).toBe('./x.pdf');
    expect(result.filePath).toBe(path.join(cwd(), 'note-first-presenter.config.ts'));
  });

  it('rejects unknown keys via valibot', async () => {
    await fs.writeFile(
      path.join(cwd(), 'note-first-presenter.config.js'),
      `export default { invalidKey: true };`,
    );
    await expect(loadNfpConfig(cwd(), 'dev')).rejects.toThrow();
  });

  // Strict validation is the contract, not an accident of the schema library.
  // Slidev's resolveConfig spreads unknown keys through, coerces a bad
  // colorSchema to 'auto' and never looks at routerMode at all; nfp refuses,
  // because a setting that was silently ignored is indistinguishable from one
  // that worked (docs/adr/0017, docs/adr/0019). The bad extension in particular
  // is caught here as a wrong *setting* — left alone it reaches pdfjs, which
  // fails with a parse error naming nothing the author can act on.
  it.each([
    ['a routerMode outside the picklist', `export default { routerMode: 'bogus' };`, /./],
    ['a slides extension nothing can render', `export default { slides: 'deck.key' };`, /\.pdf/],
  ])('rejects %s', async (_name, source, message) => {
    await fs.writeFile(path.join(cwd(), 'note-first-presenter.config.ts'), source);
    await expect(loadNfpConfig(cwd(), 'build')).rejects.toThrow(message);
  });
});
