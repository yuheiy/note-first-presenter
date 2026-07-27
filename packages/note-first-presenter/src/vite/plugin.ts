import { once } from 'node:events';
import path from 'node:path';
import { dbSchema } from '@note-first-presenter/client/dbSchema';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import * as v from 'valibot';
import { CONFIG_FILENAMES, loadNfpConfig } from '../config.ts';
import { readDb, writeDb } from '../db.ts';
import {
  DEFAULT_SLIDES_PATH,
  missingSlidesMeta,
  openSlides,
  PageOutOfRangeError,
  resolveSlides,
  slideFilename,
  type Slides,
  type SlidesStatus,
} from '../slides.ts';

// ─── Slides context ────────────────────────────────────────────────────────
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
// contract: since routerMode/base arrived, `cli.ts` parses the config itself
// before this plugin exists, so a malformed config never gets this far — dev
// exits, the same as build (docs/adr/0017, test/config.test.ts).

const CONFIG_PATHS = new Set(CONFIG_FILENAMES.map((name) => path.resolve(name)));

/**
 * Waits until a watcher is actually watching something, not merely `ready`.
 *
 * Every path this file watches — the deck, the config files — is watched
 * whether or not it exists yet, and for those `ready` is not the barrier it
 * looks like. chokidar stats the path, gets ENOENT, emits `ready` immediately,
 * and only then asynchronously falls back to watching the parent directory
 * (`index.js`, the `.then` after `_addToNodeFs`). Measured on a Linux runner
 * that gap is ~25ms, and a file created inside it is not reported late — it is
 * never reported at all, because the ENOENT path already recorded the basename
 * in the parent's entry list, so the fallback's own scan takes it for something
 * it has seen. `ignoreInitial` is not what swallows it; the event does not
 * exist. macOS happens to win the same race, which is why only CI ever saw this.
 *
 * `getWatched()` going non-empty is the one observable that separates the two
 * states. The bound is for the case the code cannot fix anyway: a deck under a
 * directory that does not exist either (`slides: 'assets/x.pdf'` with no
 * `assets/`), where nothing is ever watched and waiting would just stall
 * startup.
 */
async function awaitWatching(watcher: FSWatcher, closedPromise: Promise<void>): Promise<void> {
  await Promise.race([once(watcher, 'ready'), closedPromise]);
  const deadline = Date.now() + 500;
  while (Object.keys(watcher.getWatched()).length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export async function createSlidesContext(opts?: {
  onSettle?: () => void;
  onError?: (err: unknown) => void;
}): Promise<{
  getSlidesStatus: () => SlidesStatus;
  getSlides: (slidesPath: string) => Slides;
  close: () => Promise<void>;
}> {
  const onSettle = opts?.onSettle;
  const onError = opts?.onError;

  // A failed initial reload has to leave the getter something renderable rather
  // than undefined, and this is the only honest thing to say: the reload failed,
  // so which deck the config wanted is exactly what is not known. Deliberately
  // not `resolveSlides(undefined)` — that would claim a `slides.pdf` sitting in
  // the cwd as the deck, which is a guess, and the wrong one for any project
  // whose (unreadable) config named something else.
  let slidesStatus: SlidesStatus = {
    kind: 'missing',
    path: path.resolve(DEFAULT_SLIDES_PATH),
  };

  // Per-path cache: openSlides returns a fresh closure each call, so reusing
  // the same Slides instance preserves its internal pdf-parse memoization
  // across API requests for the same PDF file.
  let cached: { path: string; slides: Slides } | null = null;
  function getSlides(slidesPath: string): Slides {
    if (!cached || cached.path !== slidesPath) {
      cached?.slides.invalidate();
      cached = { path: slidesPath, slides: openSlides(slidesPath) };
    }
    return cached.slides;
  }

  async function reload(): Promise<string[]> {
    const { config, dependencies } = await loadNfpConfig('dev');
    slidesStatus = resolveSlides(config?.slides);
    // Drop cached Slides so the next request re-opens (and re-parses if the
    // PDF content changed at the same path).
    cached?.slides.invalidate();
    cached = null;
    // The deck path is watched whether or not it exists — chokidar falls back to
    // the parent directory and reports the `add` when a file appears there,
    // which is what replaced the old cwd-wide `*.pdf` watcher. That fallback is
    // set up after `ready`, so setTargets waits for it rather than for `ready`
    // (see awaitWatching). The one case it cannot see is a deck under a
    // directory that does not exist yet (`slides: 'assets/x.pdf'` with no
    // `assets/`); that needs a dev restart.
    //
    // The config file itself is already covered by configWatcher; only its
    // imported dependencies need the dynamic watcher.
    return [slidesStatus.path, ...dependencies.filter((dep) => !CONFIG_PATHS.has(dep))];
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

  let running = false;
  let rerunPending = false;

  function trigger(): void {
    void runOnChange();
  }

  async function setTargets(paths: string[]): Promise<void> {
    const next = [...new Set(paths)].sort();
    if (next.length === currentPaths.length && next.every((p, i) => p === currentPaths[i])) {
      return;
    }
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

  async function runOnChange(): Promise<void> {
    if (running) {
      rerunPending = true;
      return;
    }
    running = true;
    try {
      do {
        rerunPending = false;
        await setTargets(await reload());
      } while (rerunPending);
      onSettle?.();
    } catch (err) {
      onError?.(err);
    } finally {
      running = false;
    }
  }

  const configWatcher = chokidar
    .watch([...CONFIG_FILENAMES], {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      ignoreInitial: true,
    })
    .on('all', trigger);

  // With ignoreInitial, events before the initial scan completes are swallowed,
  // so this has to be a barrier — but `ready` is not one for paths that do not
  // exist yet, which a project without a config file is. See awaitWatching.
  await awaitWatching(configWatcher, closedPromise);

  await runOnChange();

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

const SLIDE_RE = /^\/nfp-data\/slides\/([^/]+)\/(\d+\.webp)$/;

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── nfp-data middleware ───────────────────────────────────────────────────
// Connect middleware that routes `/nfp-data/*` requests against the slides
// state. Knows nothing about reload or watchers.
//
// The URL space mirrors the static build's `nfp-data/` directory
// (`commands/build.ts`) so the Editor and the Viewer read through identical
// client code; the only dev-only verb is `PUT /nfp-data/db.json`.
//
// Speaks in unprefixed `/nfp-data/*` and knows nothing about the base: it is
// mounted at the base instead (see the install below), so connect has already
// taken the prefix off `req.url` by the time this runs.

export function createNfpDataMiddleware(opts: {
  getSlidesStatus: () => SlidesStatus;
  getSlides: (slidesPath: string) => Slides;
}): Connect.NextHandleFunction {
  const { getSlidesStatus, getSlides } = opts;
  return (req, res, next) => {
    if (!req.url?.startsWith('/nfp-data/')) {
      next();
      return;
    }

    const url = req.url.split('?')[0];
    const method = req.method ?? 'GET';

    const json = (status: number, body: unknown): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };

    const handle = async (): Promise<void> => {
      const slidesStatus = getSlidesStatus();

      switch (true) {
        case url === '/nfp-data/db.json' && method === 'GET': {
          const db = await readDb();
          json(200, db);
          return;
        }

        case url === '/nfp-data/db.json' && method === 'PUT': {
          const raw = await readBody(req);
          let body: unknown;
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch {
            json(400, { error: 'invalid JSON' });
            return;
          }
          // Guards the trust boundary with the client-owned schema, so the shape
          // accepted here cannot drift from the one the client sends (ADR-0013).
          const result = v.safeParse(dbSchema, body);
          if (!result.success) {
            json(400, { error: 'invalid body' });
            return;
          }
          await writeDb(result.output);
          res.statusCode = 204;
          res.end();
          return;
        }

        case url === '/nfp-data/meta.json' && method === 'GET': {
          // Always 200: a deck that is not there yet is an ordinary domain
          // value the client renders as a hint, not a failure. Only a real
          // fault (500) is an error. The static build writes the same shape to
          // `nfp-data/meta.json`.
          if (slidesStatus.kind !== 'resolved') {
            json(200, missingSlidesMeta(slidesStatus));
            return;
          }
          const meta = await getSlides(slidesStatus.path).meta();
          json(200, { kind: 'resolved', ...meta });
          return;
        }

        default: {
          const slideMatch = method === 'GET' ? SLIDE_RE.exec(url) : null;
          if (!slideMatch) {
            next();
            return;
          }
          if (slidesStatus.kind !== 'resolved') {
            json(404, { error: 'slides not available' });
            return;
          }

          const requestedHash = slideMatch[1];
          const requestedFile = slideMatch[2];
          const n = Number.parseInt(requestedFile, 10);
          // Only the canonical zero-padded name is served, so dev can't answer
          // a path the static build never writes (`1.webp` vs `0001.webp`).
          if (!Number.isInteger(n) || n < 1 || slideFilename(n) !== requestedFile) {
            json(400, { error: 'invalid page' });
            return;
          }

          try {
            const { data, hash } = await getSlides(slidesStatus.path).image(n);
            if (requestedHash !== hash) {
              json(404, { error: 'hash mismatch' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('content-type', 'image/webp');
            res.setHeader('cache-control', 'public, max-age=31536000, immutable');
            res.setHeader('etag', `"${hash}-${n}"`);
            res.end(data);
          } catch (err) {
            if (err instanceof PageOutOfRangeError) {
              json(404, { error: 'out of range' });
              return;
            }
            throw err;
          }
        }
      }
    };

    handle().catch(next);
  };
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export const ViteNfpPlugin = (opts?: { cwd?: string }): Plugin => ({
  name: 'note-first-presenter',
  apply: 'serve',
  async configureServer(server: ViteDevServer) {
    if (opts?.cwd) process.chdir(opts.cwd);
    const { getSlidesStatus, getSlides, close } = await createSlidesContext({
      // Push a partial-update signal instead of a full reload so the Editor
      // can re-fetch slide metadata in place, preserving the outline editing
      // state. The client re-fetches via SlidesMetaStore.load(). See ADR-0008.
      onSettle: () => server.ws.send({ type: 'custom', event: 'nfp:slides-changed' }),
      onError: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        server.config.logger.error(`[note-first-presenter] reload failed: ${error.message}`, {
          error,
        });
        server.ws.send({
          type: 'error',
          err: { message: error.message, stack: error.stack ?? '' },
        });
      },
    });
    // Installed here rather than from a returned post hook: Vite registers
    // htmlFallbackMiddleware *before* it runs the post hooks, so a post hook
    // would sit behind the SPA fallback and never see /nfp-data/* at all.
    //
    // The cost of being that early is that Vite's own baseMiddleware has not run
    // yet, so `req.url` still carries the base. Mounting at it is connect's
    // answer to that: it strips the prefix (matching on pathname and at a
    // segment boundary, so `/subterranean/…` cannot slip through), restores the
    // URL if the handler calls next(), and — since it drops a trailing slash
    // from the mount point — collapses the default base to no mount at all.
    server.middlewares.use(
      server.config.base,
      createNfpDataMiddleware({ getSlidesStatus, getSlides }),
    );
    server.httpServer?.on('close', () => {
      close().catch((err) => server.config.logger.error(String(err)));
    });
  },
});
