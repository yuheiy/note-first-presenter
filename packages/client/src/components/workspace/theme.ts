import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

// Shared with the inline script in index.html, which applies the saved mode
// before first paint.
const STORAGE_KEY = 'nfp:theme';

// Tailwind `scheme-*` utilities set `color-scheme` on <html>. Spelled out as
// literals so Tailwind's content scanner generates them (ADR-0009).
const SCHEME_CLASS: Record<ThemeMode, string> = {
  light: 'scheme-light',
  dark: 'scheme-dark',
  system: 'scheme-light-dark',
};
const SCHEME_CLASSES = Object.values(SCHEME_CLASS);

export function readThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function writeThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function applyThemeMode(mode: ThemeMode): void {
  // `system` follows the OS through CSS (`scheme-light-dark`), so there is no
  // matchMedia here.
  const root = document.documentElement;
  root.classList.remove(...SCHEME_CLASSES);
  root.classList.add(SCHEME_CLASS[mode]);
}

/**
 * The colour scheme, persisted per browser.
 *
 * Nothing outside React writes the key — there is no `storage` listener and no
 * cross-tab sync — so plain `useState` seeded from localStorage is the whole
 * story, no external store needed (§3.5).
 */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState(readThemeMode);

  useEffect(() => {
    writeThemeMode(mode);
    applyThemeMode(mode);
  }, [mode]);

  return [mode, setMode];
}
