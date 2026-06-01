import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('esm-env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('esm-env')>()),
  BROWSER: true,
}));

const { ActiveSlideStore } = await import('../active-slide-store.svelte');

describe('ActiveSlideStore', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('starts at slide 1 by default', () => {
    const s = new ActiveSlideStore();
    expect(s.value).toBe(1);
  });

  it('hydrate() reads ?slide=N from URL', () => {
    history.replaceState(null, '', '/?slide=7');
    const s = new ActiveSlideStore();
    s.hydrate();
    expect(s.value).toBe(7);
  });

  it('hydrate() ignores non-numeric / < 1 values', () => {
    history.replaceState(null, '', '/?slide=foo');
    const s = new ActiveSlideStore();
    s.hydrate();
    expect(s.value).toBe(1);
    history.replaceState(null, '', '/?slide=0');
    s.hydrate();
    expect(s.value).toBe(1);
  });

  it('syncToUrl() writes ?slide=N via history.replaceState', () => {
    const s = new ActiveSlideStore();
    s.set(5);
    s.syncToUrl();
    expect(new URL(location.href).searchParams.get('slide')).toBe('5');
  });

  it('syncToUrl() is a no-op when ?slide already matches', () => {
    history.replaceState(null, '', '/?slide=3');
    const s = new ActiveSlideStore();
    s.set(3);
    const before = location.href;
    s.syncToUrl();
    expect(location.href).toBe(before);
  });
});
