import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `open: 'never'` keeps the HTML report on disk without launching a blocking
  // report server on failure (which would hang `vp run ready` locally).
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `vp exec -F ./e2e/fixtures/basic -- note-first-presenter --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
