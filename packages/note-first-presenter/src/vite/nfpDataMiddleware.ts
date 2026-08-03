import type { ServerResponse } from 'node:http';
import { dbSchema } from '@note-first-presenter/client/dbSchema';
import type { Connect } from 'vite';
import * as v from 'valibot';
import { readDb, writeDb } from '../db.ts';
import {
  missingSlidesMeta,
  PageOutOfRangeError,
  slideFilename,
  type Slides,
  type SlidesStatus,
} from '../slides.ts';

// Connect middleware that routes `/nfp-data/*` requests against the slides
// state. Knows nothing about reload or watchers.
//
// The URL space mirrors the static build's `nfp-data/` directory
// (`commands/build.ts`) so the Editor and the Viewer read through identical
// client code; the only dev-only verb is `PUT /nfp-data/db.json`.
//
// Speaks in unprefixed `/nfp-data/*` and knows nothing about the base: it is
// mounted at the base instead (see vite/plugin.ts), so connect has already
// taken the prefix off `req.url` by the time this runs.

const SLIDE_RE = /^\/nfp-data\/slides\/([^/]+)\/(\d+\.webp)$/;

// The db is a title plus an outline; a body past this is not a plausible db
// write, so it is refused before being buffered whole.
const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLargeError extends Error {}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function createNfpDataMiddleware(opts: {
  cwd: string;
  getSlidesStatus: () => SlidesStatus;
  getSlides: (slidesPath: string) => Slides;
}): Connect.NextHandleFunction {
  const { cwd, getSlidesStatus, getSlides } = opts;

  return (req, res, next) => {
    if (!req.url?.startsWith('/nfp-data/')) {
      next();
      return;
    }

    const url = req.url.split('?')[0];
    const method = req.method ?? 'GET';

    const handle = async (): Promise<void> => {
      if (url === '/nfp-data/db.json' && method === 'GET') {
        sendJson(res, 200, await readDb(cwd));
        return;
      }

      if (url === '/nfp-data/db.json' && method === 'PUT') {
        let raw: Buffer;
        try {
          raw = await readBody(req);
        } catch (err) {
          if (err instanceof BodyTooLargeError) {
            sendJson(res, 413, { error: 'body too large' });
            return;
          }
          throw err;
        }
        let body: unknown;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          sendJson(res, 400, { error: 'invalid JSON' });
          return;
        }
        // Guards the trust boundary with the client-owned schema, so the shape
        // accepted here cannot drift from the one the client sends (ADR-0013).
        const result = v.safeParse(dbSchema, body);
        if (!result.success) {
          sendJson(res, 400, { error: 'invalid body' });
          return;
        }
        await writeDb(cwd, result.output);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (url === '/nfp-data/meta.json' && method === 'GET') {
        // Always 200: a deck that is not there yet is an ordinary domain
        // value the client renders as a hint, not a failure. Only a real
        // fault (500) is an error. The static build writes the same shape to
        // `nfp-data/meta.json`.
        const slidesStatus = getSlidesStatus();
        if (slidesStatus.kind !== 'resolved') {
          sendJson(res, 200, missingSlidesMeta(cwd, slidesStatus));
          return;
        }
        const meta = await getSlides(slidesStatus.path).meta();
        sendJson(res, 200, { kind: 'resolved', ...meta });
        return;
      }

      const slideMatch = method === 'GET' ? SLIDE_RE.exec(url) : null;
      if (!slideMatch) {
        next();
        return;
      }

      const slidesStatus = getSlidesStatus();
      if (slidesStatus.kind !== 'resolved') {
        sendJson(res, 404, { error: 'slides not available' });
        return;
      }

      const requestedHash = slideMatch[1];
      const requestedFile = slideMatch[2];
      const n = Number.parseInt(requestedFile, 10);
      // Only the canonical zero-padded name is served, so dev can't answer
      // a path the static build never writes (`1.webp` vs `0001.webp`).
      if (n < 1 || slideFilename(n) !== requestedFile) {
        sendJson(res, 400, { error: 'invalid page' });
        return;
      }

      try {
        const { data, hash } = await getSlides(slidesStatus.path).image(n);
        if (requestedHash !== hash) {
          sendJson(res, 404, { error: 'hash mismatch' });
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', 'image/webp');
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        res.setHeader('etag', `"${hash}-${n}"`);
        res.end(data);
      } catch (err) {
        if (err instanceof PageOutOfRangeError) {
          sendJson(res, 404, { error: 'out of range' });
          return;
        }
        throw err;
      }
    };

    handle().catch(next);
  };
}
