import type { Connect } from 'vite';
import * as v from 'valibot';
import type { SlidesStatus } from '../slides';
import { readDb, writeDb, dbInputSchema } from '../notes';
import { ensurePdfState, getSlideImage, getSlidesMeta, PageOutOfRangeError } from '../slides';

export interface ApiContext {
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

const SLIDE_RE = /^\/api\/slide\/([^/]+)\/(.+)$/;

export function createApiMiddleware(getCtx: () => ApiContext): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    const method = req.method ?? 'GET';

    const json = (status: number, body: unknown): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };

    const handle = async (): Promise<void> => {
      const ctx = getCtx();

      if (url === '/api/db' && method === 'GET') {
        const db = await readDb(ctx.dbPath);
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
        await writeDb(ctx.dbPath, result.output);
        res.statusCode = 204;
        res.end();
        return;
      }

      if (url === '/api/slides/meta' && method === 'GET') {
        const status = ctx.slidesStatus;
        if (status.kind !== 'resolved') {
          json(422, status);
          return;
        }
        ensurePdfState({ slidesPath: status.path, cacheRoot: ctx.cacheRoot });
        const meta = await getSlidesMeta();
        json(200, { status: 'resolved', ...meta });
        return;
      }

      const slideMatch = method === 'GET' ? SLIDE_RE.exec(url) : null;
      if (slideMatch) {
        const status = ctx.slidesStatus;
        if (status.kind !== 'resolved') {
          json(404, { error: 'slides not available' });
          return;
        }

        const requestedHash = slideMatch[1];
        const n = Number(slideMatch[2]);
        if (!Number.isInteger(n) || n < 1) {
          json(400, { error: 'invalid page' });
          return;
        }

        ensurePdfState({ slidesPath: status.path, cacheRoot: ctx.cacheRoot });

        try {
          const { data, hash } = await getSlideImage(n);
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
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
