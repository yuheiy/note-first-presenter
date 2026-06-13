export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nfp:theme';

// Tailwind `scheme-*` utilities set `color-scheme` on <html>. Literals here so
// Tailwind's content scanner generates them.
const SCHEME_CLASS: Record<ThemeMode, string> = {
  light: 'scheme-light',
  dark: 'scheme-dark',
  system: 'scheme-light-dark',
};
const SCHEME_CLASSES = Object.values(SCHEME_CLASS);

function readInitialMode(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export class ThemeStore {
  mode = $state<ThemeMode>('system');

  hydrate() {
    this.mode = readInitialMode();
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, this.mode);
  }

  applyToDocument() {
    // system mode follows the OS via CSS (scheme-light-dark), so no matchMedia here.
    const de = document.documentElement;
    de.classList.remove(...SCHEME_CLASSES);
    de.classList.add(SCHEME_CLASS[this.mode]);
  }
}
