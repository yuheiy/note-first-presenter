import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { resolveBuildOptions, resolveExportOptions } from '../defaults';

const cwd = '/proj';

describe('resolveBuildOptions', () => {
  it('defaults outDir to dist', () => {
    expect(resolveBuildOptions({ cwd, config: null, flags: {} }).outDir).toBe(
      path.join(cwd, 'dist'),
    );
  });
  it('lets a CLI flag override config and default', () => {
    const out = resolveBuildOptions({
      cwd,
      config: { build: { outDir: 'site' } },
      flags: { outDir: 'public' },
    });
    expect(out.outDir).toBe(path.join(cwd, 'public'));
  });
  it('uses config outDir when no flag', () => {
    const out = resolveBuildOptions({ cwd, config: { build: { outDir: 'site' } }, flags: {} });
    expect(out.outDir).toBe(path.join(cwd, 'site'));
  });
});

describe('resolveExportOptions', () => {
  it('applies defaults and resolves imageDir under outDir', () => {
    const out = resolveExportOptions({
      cwd,
      config: { export: { format: { template: 'tpl.eta', extension: 'md' } } },
      flags: {},
    });
    expect(out.outDir).toBe(path.join(cwd, 'export'));
    expect(out.imageDir).toBe(path.join(cwd, 'export', 'images'));
    expect(out.imageRelDir).toBe('images');
    expect(out.templatePath).toBe(path.join(cwd, 'tpl.eta'));
    expect(out.extension).toBe('md');
  });
  it('lets --template flag override config template', () => {
    const out = resolveExportOptions({
      cwd,
      config: { export: { format: { template: 'tpl.eta', extension: 'md' } } },
      flags: { template: 'other.eta' },
    });
    expect(out.templatePath).toBe(path.join(cwd, 'other.eta'));
  });
  it('defaults to the built-in HTML template (null templatePath) when format is unset', () => {
    const out = resolveExportOptions({ cwd: '/proj', config: { export: {} }, flags: {} });
    expect(out.templatePath).toBeNull();
    expect(out.extension).toBe('html');
  });
  it('defaults to HTML when config is null', () => {
    const out = resolveExportOptions({ cwd: '/proj', config: null, flags: {} });
    expect(out.templatePath).toBeNull();
    expect(out.extension).toBe('html');
  });
  it('keeps imageRelDir relative even for an absolute --image-dir', () => {
    const out = resolveExportOptions({
      cwd,
      config: { export: { format: { template: 'tpl.eta', extension: 'md' } } },
      flags: { imageDir: '/proj/assets/imgs' },
    });
    expect(out.imageDir).toBe('/proj/assets/imgs');
    expect(out.imageRelDir).toBe('../assets/imgs');
    expect(path.posix.isAbsolute(out.imageRelDir)).toBe(false);
  });
});
