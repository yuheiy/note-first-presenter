import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: { singleQuote: true },
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
      {
        // Browser-mode component tests import `expect` from `vitest` so that
        // @vitest/browser-playwright's matchers augmentation (declare module
        // 'vitest') is picked up by the type checker. The vitest specifier is
        // catalog-aliased to @voidzero-dev/vite-plus-test, so behavior is
        // identical at runtime.
        files: ['packages/client/src/**/*.svelte.test.ts'],
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
