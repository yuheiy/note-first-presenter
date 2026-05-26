import { describe, expect, it } from 'vite-plus/test';
import { buildVirtualConfigModuleSource } from '../virtual-modules';

describe('buildVirtualConfigModuleSource', () => {
  it('emits cwd, slidesStatus, dbPath, cacheRoot', () => {
    const src = buildVirtualConfigModuleSource({
      cwd: '/proj',
      slidesStatus: { kind: 'resolved', path: '/proj/a.pdf' },
      fullConfig: null,
    });
    expect(src).toContain(`"cwd":"/proj"`);
    expect(src).toContain(`"slidesStatus"`);
    expect(src).toContain(`"dbPath":"/proj/.note-first-presenter.json"`);
    expect(src).toContain(`"cacheRoot":"/proj/node_modules/.note-first-presenter"`);
  });
});
