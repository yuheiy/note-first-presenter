import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    // `dev` lives here rather than in package.json so it can declare the build
    // it needs. Without it a fresh clone dies twice over — `node --watch-path`
    // throws ENOENT on the directory it was told to watch, and the bin throws
    // ERR_MODULE_NOT_FOUND on `../dist/cli.mjs` — and neither says "build
    // first". The root `dev` script starts this in parallel with
    // `note-first-presenter#dev` (`vp pack --watch`), so declaring the
    // dependency is also what keeps the two from racing for dist on first run.
    tasks: {
      dev: {
        // Watching only the CLI's dist is the point: the client half of a dev
        // session reaches the browser through Vite's HMR and must not restart
        // the server. See docs/adr/0020 for why this is `node --watch-path` and
        // not a watcher dependency, and for the platform it costs.
        command:
          'node --watch-path=../packages/note-first-presenter/dist --watch-preserve-output ../packages/note-first-presenter/bin/note-first-presenter.mjs',
        dependsOn: ['note-first-presenter#build'],
        cache: false,
      },
    },
  },
});
