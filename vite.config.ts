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
    ],
  },
  run: {
    cache: true,
  },
});
