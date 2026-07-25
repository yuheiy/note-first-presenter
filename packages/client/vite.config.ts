import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

// Test/IDE config only. Plugins that must affect the real app go into the CLI's
// createViteConfig (packages/note-first-presenter/src/vite/index.ts), which is
// the single source of truth for the app build — see docs/adr/0007.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: true,
        test: {
          // Keyed by the `.browser.` suffix rather than by extension: needing a
          // real browser does not imply JSX (plugins/paste.ts needs DOMParser
          // and no React at all). See plans/react-rewrite-spec.md §8.2.
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
