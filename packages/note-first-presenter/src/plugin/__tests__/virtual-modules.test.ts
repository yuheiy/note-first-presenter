import { describe, expect, it } from 'vite-plus/test';
import { buildRuntimeConfigObject } from '../virtual-modules';

describe('buildRuntimeConfigObject', () => {
  it('emits cwd, slidesStatus, dbPath, cacheRoot', () => {
    const rc = buildRuntimeConfigObject({
      cwd: '/proj',
      slidesStatus: { kind: 'resolved', path: '/proj/a.pdf' },
      fullConfig: null,
      mode: 'dev',
    });
    expect(rc.cwd).toBe('/proj');
    expect(rc.slidesStatus).toEqual({ kind: 'resolved', path: '/proj/a.pdf' });
    expect(rc.dbPath).toBe('/proj/.note-first-presenter.json');
    expect(rc.cacheRoot).toBe('/proj/node_modules/.note-first-presenter');
  });
});
