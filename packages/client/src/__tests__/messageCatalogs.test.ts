import { describe, expect, it } from 'vite-plus/test';
import en from '../../messages/en.json' with { type: 'json' };
import ja from '../../messages/ja.json' with { type: 'json' };
import { locales } from '../lib/paraglide/runtime.js';

/**
 * Key parity between the catalogs — the only thing guarding it.
 *
 * Paraglide compiles a missing translation to `const ja_x = en_x` and exits 0, so
 * a key dropped from one locale is not a build error: a Japanese browser would
 * silently read English (ADR-0016).
 *
 * `$schema` is the plugin's own marker, not a message.
 */
function messageKeys(catalog: Record<string, unknown>): string[] {
  return Object.keys(catalog)
    .filter((key) => key !== '$schema')
    .sort();
}

const CATALOGS = { en, ja };

describe('message catalogs', () => {
  it('covers every locale the project declares', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...locales].sort());
  });

  it('translates the same keys in every locale', () => {
    const base = messageKeys(en);
    expect(base.length).toBeGreaterThan(0);
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      expect(messageKeys(catalog), `${locale}.json`).toEqual(base);
    }
  });

  it('takes the same placeholders in every locale', () => {
    // Same keys is not enough: a translation that drops `{path}` renders a
    // sentence with no path in it.
    const placeholders = (message: string) =>
      [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

    for (const key of messageKeys(en)) {
      for (const [locale, catalog] of Object.entries(CATALOGS)) {
        const translated = (catalog as Record<string, string>)[key] ?? '';
        expect(placeholders(translated), `${key} in ${locale}.json`).toEqual(
          placeholders((en as Record<string, string>)[key] ?? ''),
        );
      }
    }
  });
});
