import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ThemeStore } from '../theme-store.svelte';

describe('ThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('scheme-light', 'scheme-dark', 'scheme-light-dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('scheme-light', 'scheme-dark', 'scheme-light-dark');
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

  it('persist() writes the current mode to localStorage', () => {
    const s = new ThemeStore();
    s.mode = 'light';
    s.persist();
    expect(localStorage.getItem('nfp:theme')).toBe('light');
  });

  it('applyToDocument() uses scheme-light-dark in system mode', () => {
    const s = new ThemeStore();
    s.mode = 'system';
    s.applyToDocument();
    const cl = document.documentElement.classList;
    expect(cl.contains('scheme-light-dark')).toBe(true);
    expect(cl.contains('scheme-light')).toBe(false);
    expect(cl.contains('scheme-dark')).toBe(false);
  });

  it('applyToDocument() pins the scheme class to the chosen mode', () => {
    const s = new ThemeStore();
    const cl = document.documentElement.classList;
    s.mode = 'dark';
    s.applyToDocument();
    expect(cl.contains('scheme-dark')).toBe(true);
    expect(cl.contains('scheme-light')).toBe(false);
    s.mode = 'light';
    s.applyToDocument();
    expect(cl.contains('scheme-light')).toBe(true);
    expect(cl.contains('scheme-dark')).toBe(false);
    expect(cl.contains('scheme-light-dark')).toBe(false);
  });
});
