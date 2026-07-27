import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    singleQuote: true,
    // Sort Tailwind classes; stylesheet points Oxfmt at the v4 CSS entry.
    sortTailwindcss: { stylesheet: 'packages/client/src/style.css' },
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    // `plugins` replaces the default set rather than extending it, so the
    // defaults are spelled out alongside `react`.
    plugins: ['eslint', 'unicorn', 'typescript', 'oxc', 'react'],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'error',
      // The automatic JSX runtime (jsx: "react-jsx") means React is not a
      // required import; this rule predates it.
      'react/react-in-jsx-scope': 'off',
    },
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
    // Both layers reach the CLI through the `note-first-presenter` bin on PATH,
    // and that bin forwards to `dist/` (docs/adr/0020) — so they need a build
    // ahead of them or they run last commit's CLI. Declared rather than chained
    // into the script so the cache can skip it when nothing under src/ moved.
    // This is also what keeps a layer pointed at the shipped artifact: without
    // it, nothing would exercise `dist/` until publish.
    tasks: {
      'test:integration': {
        command: 'vp run messages && vp test',
        dependsOn: ['note-first-presenter#build'],
      },
      'test:e2e': {
        command: 'vp run messages && playwright install && playwright test',
        dependsOn: ['note-first-presenter#build'],
      },
    },
  },
});
