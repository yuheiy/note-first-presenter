import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/cli/*.cli.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    globalSetup: ['./test/cli/setup-pack.ts'],
  },
});
