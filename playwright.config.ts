import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: { command: 'vp exec -F ./e2e/fixtures/basic -- note-first-presenter', port: 5173 },
  testMatch: '**/*.e2e.{ts,js}',
});
