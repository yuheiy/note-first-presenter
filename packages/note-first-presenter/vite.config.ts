import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/cli.ts'],
    dts: {
      tsgo: true,
    },
    exports: {
      exclude: ['cli'],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
