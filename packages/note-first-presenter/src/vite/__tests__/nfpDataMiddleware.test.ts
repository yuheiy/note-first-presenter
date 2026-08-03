import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { defaultDb } from '@note-first-presenter/client/dbSchema';
import { afterAll, describe, expect, it } from 'vite-plus/test';
import { openSlides, type SlidesStatus } from '../../slides.ts';
import { freshTempDir } from '../../__tests__/helpers.ts';
import { createNfpDataMiddleware } from '../nfpDataMiddleware.ts';

const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');

const cwd = freshTempDir('nfp-mw-');

type Middleware = ReturnType<typeof createNfpDataMiddleware>;

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | undefined;
  setHeader(name: string, value: string): void;
  end(chunk?: string | Buffer): void;
  done: Promise<void>;
}

function createMockReq(method: string, url: string, body?: string) {
  const req = Readable.from(body == null ? [] : [Buffer.from(body)]);
  return Object.assign(req, { method, url }) as unknown as Parameters<Middleware>[0];
}

function createMockRes(): MockResponse {
  let resolve!: () => void;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk != null) {
        this.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      } else {
        this.body = Buffer.alloc(0);
      }
      resolve();
    },
    done,
  };
  return res;
}

/** Drives the middleware once; `next` reaching the handler is a failure. */
async function callMw(
  mw: Middleware,
  method: string,
  url: string,
  body?: string,
): Promise<MockResponse> {
  const res = createMockRes();
  mw(createMockReq(method, url, body), res as unknown as Parameters<Middleware>[1], () => {
    throw new Error('next should not be called');
  });
  await res.done;
  return res;
}

/** Resolved per call: the temp dir only exists inside a test. */
const noSlides = (): SlidesStatus => ({
  kind: 'missing',
  path: path.join(cwd(), 'assets/deck.pdf'),
});

function unresolvedMw(): Middleware {
  return createNfpDataMiddleware({
    cwd: cwd(),
    getSlidesStatus: noSlides,
    getSlides: () => {
      throw new Error('getSlides should not be called when slides are unresolved');
    },
  });
}

describe('createNfpDataMiddleware', () => {
  it('GET /nfp-data/db.json on a missing db file returns 200 with empty db', async () => {
    const res = await callMw(unresolvedMw(), 'GET', '/nfp-data/db.json');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toEqual(defaultDb());
  });

  it('PUT /nfp-data/db.json with a valid body returns 204 and writes the file', async () => {
    const db = { version: 1, title: 'x', outline: { type: 'doc', content: [] } };
    const res = await callMw(unresolvedMw(), 'PUT', '/nfp-data/db.json', JSON.stringify(db));
    expect(res.statusCode).toBe(204);
    expect(res.body!.length).toBe(0);
    const written = JSON.parse(
      await fs.readFile(path.join(cwd(), '.note-first-presenter.json'), 'utf8'),
    );
    expect(written).toEqual(db);
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a schema-invalid body', JSON.stringify({ version: 2 })],
  ])('PUT /nfp-data/db.json with %s returns 400', async (_name, body) => {
    const res = await callMw(unresolvedMw(), 'PUT', '/nfp-data/db.json', body);
    expect(res.statusCode).toBe(400);
  });

  it('PUT /nfp-data/db.json past the size cap returns 413', async () => {
    const body = 'x'.repeat(1024 * 1024 + 1);
    const res = await callMw(unresolvedMw(), 'PUT', '/nfp-data/db.json', body);
    expect(res.statusCode).toBe(413);
  });

  // Always 200: a deck that is not there yet is an ordinary domain value the
  // client renders as a hint, not a failure. (That the path comes out relative
  // is missingSlidesMeta's contract, pinned in slides.test.ts.)
  it('GET /nfp-data/meta.json with a missing deck returns 200', async () => {
    const res = await callMw(unresolvedMw(), 'GET', '/nfp-data/meta.json');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toMatchObject({ kind: 'missing' });
  });

  it('calls next for a path outside /nfp-data/', async () => {
    const res = createMockRes();
    let nextCalled = false;
    unresolvedMw()(
      createMockReq('GET', '/whatever'),
      res as unknown as Parameters<Middleware>[1],
      () => {
        nextCalled = true;
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(nextCalled).toBe(true);
    expect(res.body).toBeUndefined();
  });
});

// Wires a real `Slides` over the sample PDF fixture to cover the branches the
// throw-on-getSlides stub above can't reach: hash matching, page validation,
// and the success/out-of-range response shapes.
describe('createNfpDataMiddleware slide images', () => {
  // An explicit per-suite cacheRoot (rather than the per-test temp dir) lets
  // the Slides instance keep its parse cache across tests.
  const cacheRoot = mkdtempSync(path.join(tmpdir(), 'nfp-mw-cache-'));
  const slides = openSlides(SAMPLE_PDF, { cacheRoot });
  const mw = createNfpDataMiddleware({
    cwd: cacheRoot,
    getSlidesStatus: () => ({ kind: 'resolved', path: SAMPLE_PDF }),
    getSlides: () => slides,
  });

  afterAll(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  });

  it('GET /nfp-data/meta.json with resolved slides returns the resolved meta', async () => {
    const { hash, pageCount } = await slides.meta();
    const res = await callMw(mw, 'GET', '/nfp-data/meta.json');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toMatchObject({ kind: 'resolved', hash, pageCount });
  });

  it('GET with a valid hash and page returns 200 with image headers', async () => {
    const { hash } = await slides.meta();
    const res = await callMw(mw, 'GET', `/nfp-data/slides/${hash}/0001.webp`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['etag']).toBe(`"${hash}-1"`);
    expect(res.body!.length).toBeGreaterThan(0);
  });

  // Only the static build's canonical zero-padded names are served, so dev
  // can't answer a path the static build never writes.
  it.each([
    ['an unpadded page name', '/nfp-data/slides/x/1.webp'],
    ['page 0', '/nfp-data/slides/x/0000.webp'],
  ])('GET %s returns 400', async (_name, url) => {
    const res = await callMw(mw, 'GET', url);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'invalid page' });
  });

  it.each([
    [
      'a mismatched hash',
      () => mw,
      async () => '/nfp-data/slides/wronghash/0001.webp',
      'hash mismatch',
    ],
    [
      'a page past the last',
      () => mw,
      async () => `/nfp-data/slides/${(await slides.meta()).hash}/0999.webp`,
      'out of range',
    ],
    [
      'unresolved slides',
      unresolvedMw,
      async () => '/nfp-data/slides/x/0001.webp',
      'slides not available',
    ],
  ])('GET with %s returns 404', async (_name, mwOf, urlOf, error) => {
    const res = await callMw(mwOf(), 'GET', await urlOf());
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body!.toString())).toEqual({ error });
  });
});
