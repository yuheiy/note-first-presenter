import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, 'src/lib'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/*.test.ts'],
    exclude: ['src/**/__tests__/*.browser.test.ts'],
  },
});
