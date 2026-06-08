export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nfp:theme';

function readInitialMode(): ThemeMode {
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
    this.systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  listenSystem(): () => void {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      this.systemPrefersDark = e.matches;
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, this.mode);
  }

  applyToDocument() {
    document.documentElement.dataset.theme = this.resolved;
  }
}
