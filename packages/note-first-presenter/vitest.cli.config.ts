import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/cli/*.cli.test.ts'],
    hookTimeout: 180_000,
    globalSetup: ['./test/cli/setup-pack.ts'],
  },
});
