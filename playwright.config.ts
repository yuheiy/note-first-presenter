import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Tests share one server-side DB instance, so concurrent workers cause
  // cross-worker DB state races (e.g. beforeEach waitForResponse never fires
  // because another worker's title-save reached the server between our resetDb
  // and page.goto). Serialise execution to keep each test's DB state clean.
  workers: 1,
  webServer: {
    // Launch via `vp exec`, not `vp run`: under Playwright's piped stdio the
    // Rust `vp run` fails to spawn the child server with "os error 22 (Invalid
    // argument)" when reached through `vp run test:e2e`. `vp exec` spawns fine.
    command: 'vp exec -F ./e2e/fixtures/basic -- note-first-presenter',
    port: 5173,
    // Never reuse a pre-existing server: e2e requires the server to run with
    // the fixture cwd. Reusing a dev server started in a different cwd would
    // silently corrupt all tests.
    reuseExistingServer: false,
  },
  testMatch: '**/*.e2e.{ts,js}',
});
