import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import * as v from 'valibot';
import { CONFIG_FILENAMES, loadNfpConfig } from '../config';
import { dbInputSchema, readDb, writeDb } from '../db';
import {
  openSlides,
  PageOutOfRangeError,
  resolveSlides,
  type Slides,
  type SlidesStatus,
} from '../slides';

// ─── Slides context ────────────────────────────────────────────────────────
// Owns the slides domain in dev: resolves SlidesStatus from disk + config,
// caches per-PDF Slides instances, watches the cwd `*.pdf` glob, the config
// files, and the config's dependencies. On any change, re-resolves
// (single-flight, coalesced) and calls `onSettle` once the loop settles; a
// reload that throws (e.g. a malformed config) is reported via `onError`
// without crashing the loop, and leaves the last good `slidesStatus` in place
// (or `no-config-no-file` if the very first reload failed).

const CONFIG_PATHS = new Set(CONFIG_FILENAMES.map((name) => path.resolve(name)));

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

  // Defaults to no-config-no-file so a failed initial reload degrades the API
  // to 422 rather than leaving the getter undefined.
  let slidesStatus: SlidesStatus = { kind: 'no-config-no-file' };

  // Per-path cache: openSlides returns a fresh closure each call, so reusing
  // the same Slides instance preserves its internal pdf-parse memoization
  // across API requests for the same PDF file.
  let cached: { path: string; slides: Slides } | null = null;
  function getSlides(slidesPath: string): Slides {
    if (!cached || cached.path !== slidesPath) {
      cached = { path: slidesPath, slides: openSlides(slidesPath) };
    }
    return cached.slides;
  }

  async function reload(): Promise<string[]> {
    const { config, filePath, dependencies } = await loadNfpConfig('dev');
    slidesStatus = await resolveSlides({
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    // Drop cached Slides so the next request re-opens (and re-parses if the
    // PDF content changed at the same path).
    cached = null;
    // The config file itself is already covered by configWatcher; only its
    // imported dependencies need the dynamic watcher.
    return [
      ...(slidesStatus.kind === 'resolved' ? [slidesStatus.path] : []),
      ...dependencies.filter((dep) => !CONFIG_PATHS.has(dep)),
    ];
  }

  let dynamicWatcher: FSWatcher | null = null;
  let currentPaths: string[] = [];
  let closed = false;

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
    dynamicWatcher = chokidar
      .watch(next, {
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        ignoreInitial: true,
      })
      .on('all', trigger);
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

  // Auto-detect PDFs added/removed in cwd (only meaningful when config doesn't
  // pin a specific path). 'change' events go through the dynamic watcher
  // instead, which has awaitWriteFinish.
  const rootWatcher = chokidar
    .watch('*.pdf', { depth: 0, ignoreInitial: true })
    .on('add', trigger)
    .on('unlink', trigger);

  const configWatcher = chokidar
    .watch([...CONFIG_FILENAMES], {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      ignoreInitial: true,
    })
    .on('all', trigger);

  await runOnChange();

  return {
    getSlidesStatus: () => slidesStatus,
    getSlides,
    close: async () => {
      closed = true;
      const dynamic = dynamicWatcher;
      dynamicWatcher = null;
      await Promise.all([rootWatcher.close(), configWatcher.close(), dynamic?.close()]);
    },
  };
}

const SLIDE_RE = /^\/api\/slide\/([^/]+)\/(\d+)$/;

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── API middleware ────────────────────────────────────────────────────────
// Connect middleware that routes `/api/*` requests against the slides state.
// Knows nothing about reload or watchers.

export function createApiMiddleware(opts: {
  getSlidesStatus: () => SlidesStatus;
  getSlides: (slidesPath: string) => Slides;
}): Connect.NextHandleFunction {
  const { getSlidesStatus, getSlides } = opts;
  return (req, res, next) => {
    if (!req.url?.startsWith('/api/')) {
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
        case url === '/api/db' && method === 'GET': {
          const db = await readDb();
          json(200, db);
          return;
        }

        case url === '/api/db' && method === 'PUT': {
          const raw = await readBody(req);
          let body: unknown;
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch {
            json(400, { error: 'invalid JSON' });
            return;
          }
          const result = v.safeParse(dbInputSchema, body);
          if (!result.success) {
            json(400, { error: 'invalid body' });
            return;
          }
          await writeDb(result.output);
          res.statusCode = 204;
          res.end();
          return;
        }

        case url === '/api/slides/meta' && method === 'GET': {
          if (slidesStatus.kind !== 'resolved') {
            json(422, slidesStatus);
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
          const n = Number(slideMatch[2]);
          if (!Number.isInteger(n) || n < 1) {
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

export const ViteNfpPlugin = (): Plugin => ({
  name: 'note-first-presenter',
  apply: 'serve',
  async configureServer(server: ViteDevServer) {
    const { getSlidesStatus, getSlides, close } = await createSlidesContext({
      onSettle: () => server.ws.send({ type: 'full-reload' }),
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
    server.middlewares.use(createApiMiddleware({ getSlidesStatus, getSlides }));
    server.httpServer?.on('close', () => void close());
  },
});
