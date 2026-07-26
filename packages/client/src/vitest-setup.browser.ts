// Registers vitest-browser-react's automatic cleanup between tests, the same
// way react-spectrum's test/browser/setup.ts does. Importing it here rather
// than per-file keeps React-free browser tests (paste) free of the import.
import 'vitest-browser-react';
import { overwriteGetLocale } from './lib/paraglide/runtime.js';

// Pins the locale for every browser test. A real Chromium reports whatever
// language the machine running it is set to, and several tests assert on English
// copy, so without this they pass on an English laptop and fail on a Japanese one.
// Pinned globally rather than per render because Paraglide's locale is module
// state, not React context.
//
// `overwriteGetLocale` replaces the strategy chain outright, so what these tests
// do *not* cover is the resolution itself — the e2e layer does, running the real
// `preferredLanguage` path against a Playwright context with `locale: 'en-US'`.
overwriteGetLocale(() => 'en');
