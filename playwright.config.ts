import { defineConfig } from '@playwright/test';

const FIXTURE = './e2e/fixtures/basic';

export default defineConfig({
  // Tests share one server-side DB instance, so concurrent workers cause
  // cross-worker DB state races (e.g. beforeEach waitForResponse never fires
  // because another worker's title-save reached the server between our resetDb
  // and page.goto). Serialise execution to keep each test's DB state clean.
  workers: 1,
  webServer: [
    {
      // Launch via `vp exec`, not `vp run`: under Playwright's piped stdio the
      // Rust `vp run` fails to spawn the child server with "os error 22 (Invalid
      // argument)" when reached through `vp run test:e2e`. `vp exec` spawns fine.
      command: `vp exec -F ${FIXTURE} -- note-first-presenter`,
      port: 5173,
      // Never reuse a pre-existing server: e2e requires the server to run with
      // the fixture cwd. Reusing a dev server started in a different cwd would
      // silently corrupt all tests.
      reuseExistingServer: false,
    },
    {
      // Playwright starts every webServer regardless of --project, so this one
      // must come up even when no static run is happening: mkdir -p gives it an
      // empty directory to serve, and its sirv runs in per-request stat mode, so
      // it picks up the files the `static-build` setup project writes afterwards.
      command: `mkdir -p ${FIXTURE}/dist && vp preview ${FIXTURE} --outDir dist --port 4173 --strictPort`,
      port: 4173,
      reuseExistingServer: false,
    },
  ],
  // Split so a failure names its cause: `dev` exercises the CLI middleware
  // answering /nfp-data/* dynamically, `static` exercises the emitted file tree.
  // See plans/react-rewrite-spec.md §8.7.
  projects: [
    {
      name: 'dev',
      testDir: './e2e',
      testIgnore: '**/static/**',
      use: { baseURL: 'http://localhost:5173' },
    },
    // A full production build costs ~60s, so it is a setup project rather than
    // a global step: `--project=dev` never triggers it.
    {
      name: 'static-build',
      testDir: './e2e/static',
      testMatch: '**/build.setup.ts',
    },
    {
      name: 'static',
      testDir: './e2e/static',
      dependencies: ['static-build'],
      use: { baseURL: 'http://localhost:4173' },
    },
  ],
  testMatch: '**/*.e2e.{ts,js}',
});
