import { BROWSER } from 'esm-env';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nfp:theme';

function readInitialMode(): ThemeMode {
  if (!BROWSER) return 'system';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export class ThemeStore {
  mode = $state<ThemeMode>('system');
  systemPrefersDark = $state(false);

  readonly resolved: 'light' | 'dark' = $derived(
    this.mode === 'light'
      ? 'light'
      : this.mode === 'dark'
        ? 'dark'
        : this.systemPrefersDark
          ? 'dark'
          : 'light',
  );

  hydrate() {
    this.mode = readInitialMode();
    if (BROWSER) {
      this.systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  }

  listenSystem(): () => void {
    if (!BROWSER) return () => {};
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      this.systemPrefersDark = e.matches;
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }

  persist() {
    if (BROWSER) localStorage.setItem(STORAGE_KEY, this.mode);
  }

  applyToDocument() {
    if (BROWSER) document.documentElement.dataset.theme = this.resolved;
  }
}
