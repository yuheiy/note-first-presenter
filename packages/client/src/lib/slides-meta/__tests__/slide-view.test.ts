import { describe, expect, it } from 'vite-plus/test';
import { resolveSlideView } from '../slide-view';

describe('resolveSlideView', () => {
  it('passes resolved meta through with hash and page count', () => {
    const view = resolveSlideView(
      { kind: 'resolved', hash: 'abc', pageCount: 3, width: 1920, height: 1080 },
      null,
    );
    expect(view).toEqual({
      kind: 'resolved',
      hash: 'abc',
      pageCount: 3,
      width: 1920,
      height: 1080,
    });
  });

  it('maps no-config-no-file to a hint', () => {
    const view = resolveSlideView({ kind: 'no-config-no-file' }, null);
    expect(view.kind).toBe('hint');
    expect(view).toHaveProperty('message');
  });

  it('maps configured-but-missing to an error carrying the path', () => {
    const view = resolveSlideView(
      { kind: 'configured-but-missing', configuredPath: 'deck.pdf' },
      null,
    );
    expect(view.kind).toBe('error');
    expect(view.kind === 'error' && view.message).toContain('deck.pdf');
  });

  it('maps no-config-multiple-files to an error listing the candidates', () => {
    const view = resolveSlideView(
      { kind: 'no-config-multiple-files', candidates: ['a.pdf', 'b.pdf'] },
      null,
    );
    expect(view.kind).toBe('error');
    expect(view.kind === 'error' && view.message).toContain('a.pdf');
  });

  it('surfaces a transport error as an error view', () => {
    const view = resolveSlideView(null, 'network down');
    expect(view).toEqual({ kind: 'error', message: 'network down' });
  });

  it('reports pending before any meta or error has arrived', () => {
    expect(resolveSlideView(null, null)).toEqual({ kind: 'pending' });
  });
});
