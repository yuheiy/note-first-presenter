import chokidar, { type FSWatcher } from 'chokidar';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import * as v from 'valibot';
import { loadNfpConfig } from '../config';
import { dbInputSchema, readDb, writeDb } from '../db';
import {
  openSlides,
  PageOutOfRangeError,
  resolveSlides,
  type Slides,
  type SlidesStatus,
} from '../slides';

const SLIDE_RE = /^\/api\/slide\/([^/]+)\/(.+)$/;

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const handleApiRequest =
  (
    getSlidesStatus: () => SlidesStatus,
    getSlides: (slidesPath: string) => Slides,
  ): Connect.NextHandleFunction =>
  (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    const method = req.method ?? 'GET';

    const json = (status: number, body: unknown): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };

    const handle = async (): Promise<void> => {
      const slidesStatus = getSlidesStatus();

      if (url === '/api/db' && method === 'GET') {
        const db = await readDb();
        json(200, db);
        return;
      }

      if (url === '/api/db' && method === 'PUT') {
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

      if (url === '/api/slides/meta' && method === 'GET') {
        if (slidesStatus.kind !== 'resolved') {
          json(422, slidesStatus);
          return;
        }
        const meta = await getSlides(slidesStatus.path).meta();
        json(200, { status: 'resolved', ...meta });
        return;
      }

      const slideMatch = method === 'GET' ? SLIDE_RE.exec(url) : null;
      if (slideMatch) {
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
        return;
      }

      next();
    };

    handle().catch(next);
  };

function startFileWatchers(slidesStatus: SlidesStatus, onChange: () => void): () => Promise<void> {
  const watchers: FSWatcher[] = [];

  const rootWatcher = chokidar.watch('*.pdf', { depth: 0, ignoreInitial: true });
  rootWatcher.on('add', onChange);
  rootWatcher.on('unlink', onChange);
  watchers.push(rootWatcher);

  const configWatcher = chokidar.watch(
    ['note-first-presenter.config.ts', 'note-first-presenter.config.js'],
    { ignoreInitial: true },
  );
  configWatcher.on('add', onChange);
  configWatcher.on('change', onChange);
  configWatcher.on('unlink', onChange);
  watchers.push(configWatcher);

  if (slidesStatus.kind === 'resolved') {
    const pdfWatcher = chokidar.watch(slidesStatus.path, {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    pdfWatcher.on('change', onChange);
    watchers.push(pdfWatcher);
  }

  return async () => {
    await Promise.all(watchers.map((w) => w.close()));
  };
}

export function ViteNfpPlugin(initialSlidesStatus: SlidesStatus): Plugin {
  let slidesStatus = initialSlidesStatus;
  let closeWatchers: (() => Promise<void>) | null = null;

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

  return {
    name: 'note-first-presenter',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handleApiRequest(() => slidesStatus, getSlides));

      const onChange = () => {
        void (async () => {
          const { config, filePath } = await loadNfpConfig();
          slidesStatus = await resolveSlides({
            configuredSlides: config?.slides,
            configFile: filePath,
          });
          // Drop the cached Slides so the next request re-opens (and re-parses
          // if the PDF content changed at the same path).
          cached = null;
          server.ws.send({ type: 'full-reload' });
        })();
      };
      closeWatchers = startFileWatchers(slidesStatus, onChange);
    },
    async closeBundle() {
      await closeWatchers?.();
    },
  };
}
