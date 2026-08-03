import { defineConfig } from '@playwright/test';

const FIXTURE = './e2e/fixtures/basic';

export default defineConfig({
  // Every spec below names UI in English ("Slides", "Slide 1", "Title"), and the
  // app picks its language off `navigator.languages` — so without pinning this,
  // the specs depend on whatever language the machine is set to. This is also the
  // one layer that exercises Paraglide's real locale resolution rather than
  // stubbing it the way the browser tests do (docs/adr/0016).
  use: { locale: 'en-US' },
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
    {
      // The same trick again for the subdirectory artifact, served under the
      // base it was built for so `--base` is exercised the way a real deploy
      // would exercise it.
      command: `mkdir -p ${FIXTURE}/dist-sub && vp preview ${FIXTURE} --outDir dist-sub --base /sub/ --port 4174 --strictPort`,
      port: 4174,
      reuseExistingServer: false,
    },
  ],
  // Split so a failure names its cause: `dev` exercises the CLI middleware
  // answering /nfp-data/* dynamically, `static` exercises the emitted file tree.
  // See docs/adr/0005 (2026-07-26 addendum, (c)).
  projects: [
    {
      name: 'dev',
      testDir: './e2e/dev',
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
    // `--base` is the one part of URL handling that no unit test can reach:
    // four layers have to agree on it and only a real subdirectory deploy shows
    // whether they do (docs/adr/0017, e2e/subpath/base.e2e.ts). The router-mode
    // split needs no such project — it resolves inside lib/routes.ts and is
    // pinned there.
    {
      name: 'subpath-build',
      testDir: './e2e/subpath',
      testMatch: '**/build.setup.ts',
    },
    {
      name: 'subpath',
      testDir: './e2e/subpath',
      dependencies: ['subpath-build'],
      // Trailing slash included: the specs address pages relatively so that this
      // prefix survives, which a leading-slash path would discard.
      use: { baseURL: 'http://localhost:4174/sub/' },
    },
  ],
  testMatch: '**/*.e2e.{ts,js}',
});
