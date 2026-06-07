import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/cli.ts'],
    dts: { tsgo: true },
    exports: { exclude: ['cli'] },
    deps: {
      neverBundle: /node_modules/,
    },
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: { ignorePatterns: ['dist/**'] },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
