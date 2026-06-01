import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('esm-env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('esm-env')>()),
  BROWSER: true,
}));

const { ThemeStore } = await import('../theme-store.svelte');

describe('ThemeStore', () => {
  let listeners: Array<(e: MediaQueryListEvent) => void> = [];
  let mqlMatches = false;

  beforeEach(() => {
    listeners = [];
    mqlMatches = false;
    localStorage.clear();
    vi.stubGlobal('matchMedia', (_q: string) => ({
      matches: mqlMatches,
      addEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
      removeEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((x) => x !== l);
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrate() defaults to system mode when localStorage is empty', () => {
    const s = new ThemeStore();
    s.hydrate();
    expect(s.mode).toBe('system');
  });

  it('hydrate() picks up persisted "dark"', () => {
    localStorage.setItem('nfp:theme', 'dark');
    const s = new ThemeStore();
    s.hydrate();
    expect(s.mode).toBe('dark');
  });

  it('resolved derives from mode and systemPrefersDark', () => {
    const s = new ThemeStore();
    s.mode = 'system';
    s.systemPrefersDark = true;
    expect(s.resolved).toBe('dark');
    s.mode = 'light';
    expect(s.resolved).toBe('light');
  });

  it('listenSystem() updates systemPrefersDark on media change', () => {
    mqlMatches = false;
    const s = new ThemeStore();
    s.hydrate();
    const stop = s.listenSystem();
    listeners[0]?.({ matches: true } as MediaQueryListEvent);
    expect(s.systemPrefersDark).toBe(true);
    stop();
    expect(listeners).toHaveLength(0);
  });
});
