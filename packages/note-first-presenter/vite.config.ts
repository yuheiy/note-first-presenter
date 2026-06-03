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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'cli',
          environment: 'node',
          include: ['test/cli/*.cli.test.ts'],
          hookTimeout: 180_000,
          globalSetup: ['./test/cli/setup-pack.ts'],
        },
      },
    ],
  },
});
