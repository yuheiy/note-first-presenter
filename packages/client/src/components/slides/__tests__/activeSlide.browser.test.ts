import { createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { activeSlideAtom } from '../activeSlide';

/**
 * The atom ↔ URL mirror, exercised through the atom's public surface against
 * the real location and history — the storage object stays an implementation
 * detail.
 *
 * Each test gets its own store, and mounting (the `store.sub`) is what makes
 * jotai re-read the storage for that store: the value baked in at module import
 * belongs to whatever URL the runner started on, not to this test.
 */
function mountedStore() {
  const store = createStore();
  const unmount = store.sub(activeSlideAtom, () => {});
  return { store, unmount };
}

describe('activeSlideAtom', () => {
  beforeEach(() => {
    history.replaceState(null, '', location.pathname);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the slide the URL opened on', () => {
    history.replaceState(null, '', '?slide=7');
    const { store, unmount } = mountedStore();
    expect(store.get(activeSlideAtom)).toBe(7);
    unmount();
  });

  it('mirrors a slide change into the URL', () => {
    const { store, unmount } = mountedStore();
    store.set(activeSlideAtom, 3);
    expect(location.search).toBe('?slide=3');
    expect(store.get(activeSlideAtom)).toBe(3);
    unmount();
  });

  it('spells the first slide as no parameter at all', () => {
    const { store, unmount } = mountedStore();
    store.set(activeSlideAtom, 3);
    store.set(activeSlideAtom, 1);
    expect(location.search).toBe('');
    unmount();
  });

  // Any other query param on the URL is somebody else's (a tracking tag on a
  // shared link, say) and is none of this app's business to drop.
  it('leaves foreign query params alone', () => {
    history.replaceState(null, '', '?utm=x&slide=5');
    const { store, unmount } = mountedStore();
    store.set(activeSlideAtom, 2);
    const params = new URLSearchParams(location.search);
    expect([params.get('utm'), params.get('slide')]).toEqual(['x', '2']);
    store.set(activeSlideAtom, 1);
    expect(location.search).toBe('?utm=x');
    unmount();
  });

  // `replace`, never `push`: the slide follows the caret, so pushing would bury
  // the back button under an entry per separator crossed.
  it('never adds a history entry', () => {
    const { store, unmount } = mountedStore();
    const before = history.length;
    store.set(activeSlideAtom, 4);
    store.set(activeSlideAtom, 9);
    expect(history.length).toBe(before);
    unmount();
  });

  it('does not touch history when the URL already matches', () => {
    const { store, unmount } = mountedStore();
    store.set(activeSlideAtom, 3);
    const replaceState = vi.spyOn(history, 'replaceState');
    store.set(activeSlideAtom, 3);
    expect(replaceState).not.toHaveBeenCalled();
    unmount();
  });
});
