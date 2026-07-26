import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

// Test/IDE config only. Plugins that must affect the real app go into the CLI's
// createViteConfig (packages/note-first-presenter/src/vite/index.ts), which is
// the single source of truth for the app build — see docs/adr/0014.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  // The define is repeated from the CLI's createViteConfig, which is the source
  // of truth for the app build; without it every test that imports
  // lib/routes.ts dies on an undefined global (docs/adr/0017).
  //
  // The *value* is this file's own choice — the mode the test suite runs in —
  // and deliberately does not track the CLI's default. lib/routes.ts takes the
  // mode as a parameter wherever it branches, so both modes are covered by
  // routes.test.ts regardless of which one is compiled in here.
  define: { __NFP_ROUTER_MODE__: JSON.stringify('history') },
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: true,
        test: {
          // Keyed by the `.browser.` suffix rather than by extension: needing a
          // real browser does not imply JSX (plugins/paste.ts needs DOMParser
          // and no React at all). See docs/adr/0005 (2026-07-26 addendum, (a)).
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', headless: true }],
          },
          setupFiles: ['./src/vitest-setup.browser.ts'],
          include: ['src/**/*.browser.{test,spec}.{ts,tsx}'],
        },
      },

      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['src/**/*.browser.{test,spec}.{ts,tsx}'],
        },
      },
    ],
  },
});
