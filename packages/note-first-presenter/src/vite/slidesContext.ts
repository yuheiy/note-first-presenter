import { once } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { CONFIG_FILENAMES, loadNfpConfig } from '../config.ts';
import {
  DEFAULT_SLIDES_PATH,
  nfpCacheRoot,
  openSlides,
  resolveSlides,
  type Slides,
  type SlidesStatus,
} from '../slides.ts';

// Owns the slides domain in dev: resolves SlidesStatus from disk + config,
// caches per-PDF Slides instances, and watches the deck path, the config files,
// and the config's dependencies. On any change, re-resolves (single-flight,
// coalesced) and calls `onSettle` once the loop settles; a reload that throws
// (e.g. a malformed config) is reported via `onError` without crashing the
// loop, and leaves the last good `slidesStatus` in place (or the default path,
// missing, if the very first reload failed).
//
// That tolerance is for config files edited *while dev runs* — half-typed states
// are normal there, and `onError` is loud enough (server log plus the browser's
// error overlay) without taking the server down. It is not the startup
// contract: the CLI validates the config before dev starts, so a malformed
// config never gets this far — dev exits, the same as build (docs/adr/0017,
// commands/__tests__/cliCommands.test.ts).

/**
 * Waits until a watcher is actually watching something, not merely `ready`.
 *
 * For a path that does not exist yet — the deck usually, the config files often
 * — chokidar emits `ready` before it has asynchronously fallen back to watching
 * the parent directory, and a file created inside that gap is never reported at
 * all. `getWatched()` going non-empty is the one observable that separates the
 * two states. The 500ms bound is for the case the code cannot fix anyway: a
 * deck whose parent directory does not exist either, where nothing is ever
 * watched and waiting would just stall startup.
 */
async function awaitWatching(watcher: FSWatcher, closedPromise: Promise<void>): Promise<void> {
  await Promise.race([once(watcher, 'ready'), closedPromise]);
  const deadline = Date.now() + 500;
  while (Object.keys(watcher.getWatched()).length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * A task that runs at most once at a time: triggers landing while a run is in
 * flight coalesce into a single rerun, so the task always ends up having seen
 * the latest state. `onSettle` fires once per drained run; a throw goes to
 * `onError` and ends the run without poisoning later triggers.
 */
function coalesced(
  task: () => Promise<void>,
  opts: { onSettle?: () => void; onError?: (err: unknown) => void },
): { run: () => Promise<void>; trigger: () => void } {
  let running = false;
  let rerunPending = false;
  const run = async (): Promise<void> => {
    if (running) {
      rerunPending = true;
      return;
    }
    running = true;
    try {
      do {
        rerunPending = false;
        await task();
      } while (rerunPending);
      opts.onSettle?.();
    } catch (err) {
      opts.onError?.(err);
    } finally {
      running = false;
    }
  };
  return { run, trigger: () => void run() };
}

export async function createSlidesContext(opts: {
  cwd: string;
  onSettle?: () => void;
  onError?: (err: unknown) => void;
}): Promise<{
  getSlidesStatus: () => SlidesStatus;
  getSlides: (slidesPath: string) => Slides;
  close: () => Promise<void>;
}> {
  const { cwd, onSettle, onError } = opts;
  const configPaths = CONFIG_FILENAMES.map((name) => path.resolve(cwd, name));
  const cacheRoot = nfpCacheRoot(cwd);

  // A failed initial reload has to leave the getter something renderable rather
  // than undefined, and this is the only honest thing to say: the reload failed,
  // so which deck the config wanted is exactly what is not known. Deliberately
  // not `resolveSlides(cwd, undefined)` — that would claim a `slides.pdf`
  // sitting in the project as the deck, which is a guess, and the wrong one for
  // any project whose (unreadable) config named something else.
  let slidesStatus: SlidesStatus = {
    kind: 'missing',
    path: path.resolve(cwd, DEFAULT_SLIDES_PATH),
  };

  // Per-path cache: openSlides returns a fresh closure each call, so reusing
  // the same Slides instance preserves its internal pdf-parse memoization
  // across API requests for the same PDF file.
  let cached: { path: string; slides: Slides } | null = null;
  function getSlides(slidesPath: string): Slides {
    if (!cached || cached.path !== slidesPath) {
      cached?.slides.invalidate();
      cached = { path: slidesPath, slides: openSlides(slidesPath, { cacheRoot }) };
    }
    return cached.slides;
  }

  async function reload(): Promise<string[]> {
    const { config, dependencies } = await loadNfpConfig(cwd, 'dev');
    slidesStatus = resolveSlides(cwd, config?.slides);
    // Drop cached Slides so the next request re-opens (and re-parses if the
    // PDF content changed at the same path).
    cached?.slides.invalidate();
    cached = null;
    // The deck path is watched whether or not it exists — chokidar falls back
    // to the parent directory and reports the `add` when a file appears there.
    // That fallback is set up after `ready`, so setTargets waits for it rather
    // than for `ready` (see awaitWatching). The one case it cannot see is a
    // deck under a directory that does not exist yet (`slides: 'assets/x.pdf'`
    // with no `assets/`); that needs a dev restart.
    //
    // The config file itself is already covered by configWatcher; only its
    // imported dependencies need the dynamic watcher.
    return [slidesStatus.path, ...dependencies.filter((dep) => !configPaths.includes(dep))];
  }

  let dynamicWatcher: FSWatcher | null = null;
  let currentPaths: string[] = [];
  let closed = false;
  // Lets setTargets stop waiting for 'ready' if the context is closed
  // mid-setup; a closed watcher may never emit it.
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  async function setTargets(paths: string[]): Promise<void> {
    const next = [...new Set(paths)].sort();
    // Paths cannot contain NUL, so the joined strings are equal exactly when
    // the lists are.
    if (next.join('\0') === currentPaths.join('\0')) return;
    // Update state before awaiting close so a rejecting close() can't wedge it.
    currentPaths = next;
    const previous = dynamicWatcher;
    dynamicWatcher = null;
    await previous?.close();
    if (next.length === 0 || closed) return;
    const watcher = chokidar
      .watch(next, {
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        ignoreInitial: true,
      })
      .on('all', trigger);
    dynamicWatcher = watcher;
    // Same barrier as the config watcher below, and for the same reason: the
    // deck path is usually one that does not exist yet, so `ready` alone would
    // return here before anything is being watched. See awaitWatching.
    await awaitWatching(watcher, closedPromise);
  }

  const { run, trigger } = coalesced(async () => setTargets(await reload()), {
    onSettle,
    onError,
  });

  const configWatcher = chokidar
    .watch(configPaths, {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      ignoreInitial: true,
    })
    .on('all', trigger);

  // With ignoreInitial, events before the initial scan completes are swallowed,
  // so this has to be a barrier — but `ready` is not one for paths that do not
  // exist yet, which a project without a config file is. See awaitWatching.
  await awaitWatching(configWatcher, closedPromise);

  await run();

  return {
    getSlidesStatus: () => slidesStatus,
    getSlides,
    close: async () => {
      closed = true;
      resolveClosed();
      const dynamic = dynamicWatcher;
      dynamicWatcher = null;
      cached?.slides.invalidate();
      cached = null;
      await Promise.all([configWatcher.close(), dynamic?.close()]);
    },
  };
}
