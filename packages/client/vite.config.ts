import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['src/**/__tests__/*.test.ts'],
          exclude: ['src/**/__tests__/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['src/**/__tests__/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
    ],
  },
});
