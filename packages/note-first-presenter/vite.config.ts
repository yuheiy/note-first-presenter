import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    dts: { tsgo: true },
    exports: true,
    deps: {
      alwaysBundle: ['@note-first-presenter/client'],
      neverBundle: /node_modules/,
    },
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: { ignorePatterns: ['dist/**'] },
});
