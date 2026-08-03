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
        // The published CLI depends on plain `vite`, so it imports the runtime
        // API from `vite` — locally the same code anyway; see the catalog notes
        // in pnpm-workspace.yaml (docs/adr/0020).
        files: ['packages/note-first-presenter/**'],
        rules: { 'vite-plus/prefer-vite-plus-imports': 'off' },
      },
    ],
  },
  run: {
    cache: true,
    tasks: {
      // e2e reaches the CLI through the `note-first-presenter` bin on PATH, and
      // that bin forwards to `dist/` (docs/adr/0020) — so it needs a build ahead
      // of it or it runs last commit's CLI. Declared rather than chained into
      // the script so the cache can skip it when nothing under src/ moved.
      'test:e2e': {
        command: 'vp run messages && playwright install && playwright test',
        dependsOn: ['note-first-presenter#build'],
      },
      // The published form, verified by installing it (docs/adr/0021). Not a
      // test layer: it is nobody's `*.test.ts`, and `vp run test` does not
      // reach it. CI runs it on every change and `prepublishOnly` runs it on
      // the way out.
      //
      // No `dependsOn` and no cache, both on purpose. The script packs, and
      // packing fires `prepack`, so the build is guaranteed by the thing being
      // measured rather than by a declaration beside it — a gate that trusted
      // the task cache to tell it the artifact was current would be trusting
      // the one thing it exists to check. It runs rarely enough that a cache
      // would save nothing anyway.
      'verify:package': {
        command: 'node scripts/verify-package.ts',
        cache: false,
      },
    },
  },
});
