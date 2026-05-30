import { describe, expect, it } from 'vite-plus/test';
import { buildModeModuleSource, buildVirtualConfigModuleSource } from '../virtual-modules';

describe('buildVirtualConfigModuleSource', () => {
  it('emits cwd, slidesStatus, dbPath, cacheRoot', () => {
    const src = buildVirtualConfigModuleSource({
      cwd: '/proj',
      slidesStatus: { kind: 'resolved', path: '/proj/a.pdf' },
      fullConfig: null,
      mode: 'dev',
    });
    expect(src).toContain(`"cwd":"/proj"`);
    expect(src).toContain(`"slidesStatus"`);
    expect(src).toContain(`"dbPath":"/proj/.note-first-presenter.json"`);
    expect(src).toContain(`"cacheRoot":"/proj/node_modules/.note-first-presenter"`);
  });
});

describe('buildModeModuleSource', () => {
  it('emits isStatic=true for build mode', () => {
    expect(buildModeModuleSource('build')).toContain('isStatic = true');
  });
  it('emits isStatic=false for dev mode', () => {
    expect(buildModeModuleSource('dev')).toContain('isStatic = false');
  });
});
