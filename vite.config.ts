import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
    '*.svelte': 'vp exec --filter @note-first-presenter/client -- svelte-check --threshold error',
  },
  fmt: {
    singleQuote: true,
    // Sort Tailwind classes; stylesheet points Oxfmt at the v4 CSS entry.
    sortTailwindcss: { stylesheet: 'packages/client/src/routes/layout.css' },
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // The published CLI depends on `vite` (npm:@voidzero-dev/vite-plus-core),
        // not the `vite-plus` toolchain, so it imports the runtime API from `vite`.
        files: ['packages/note-first-presenter/**'],
        rules: { 'vite-plus/prefer-vite-plus-imports': 'off' },
      },
    ],
  },
  test: {
    include: ['test/**/*.{test,spec}.{js,ts}'],
  },
  run: {
    cache: true,
  },
});
