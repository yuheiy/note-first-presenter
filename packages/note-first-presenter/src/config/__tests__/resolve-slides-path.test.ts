import { describe, expect, it } from 'vite-plus/test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSlidesPath } from '../resolve-slides-path';

async function makeTmp() {
  return fs.mkdtemp(path.join(tmpdir(), 'nfp-slides-'));
}

describe('resolveSlidesPath', () => {
  it('returns no-config-no-file when nothing exists', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-no-file');
  });

  it('returns resolved when a single PDF exists', async () => {
    const cwd = await makeTmp();
    const pdf = path.join(cwd, 'slides.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });

  it('returns no-config-multiple-files when many', async () => {
    const cwd = await makeTmp();
    await fs.writeFile(path.join(cwd, 'a.pdf'), '%PDF-1.4');
    await fs.writeFile(path.join(cwd, 'b.pdf'), '%PDF-1.4');
    const result = await resolveSlidesPath({ cwd, configuredSlides: undefined, configFile: null });
    expect(result.kind).toBe('no-config-multiple-files');
  });

  it('returns configured-but-missing when path does not exist', async () => {
    const cwd = await makeTmp();
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './missing.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result.kind).toBe('configured-but-missing');
  });

  it('resolves configured path relative to config file directory', async () => {
    const cwd = await makeTmp();
    const sub = path.join(cwd, 'docs');
    await fs.mkdir(sub, { recursive: true });
    const pdf = path.join(sub, 'main.pdf');
    await fs.writeFile(pdf, '%PDF-1.4');
    const result = await resolveSlidesPath({
      cwd,
      configuredSlides: './docs/main.pdf',
      configFile: path.join(cwd, 'note-first-presenter.config.ts'),
    });
    expect(result).toEqual({ kind: 'resolved', path: pdf });
  });
});
