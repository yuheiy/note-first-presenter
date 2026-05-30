import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    dts: { tsgo: true },
    exports: true,
    deps: {
      neverBundle: /node_modules/,
    },
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: { ignorePatterns: ['dist/**'] },
});
