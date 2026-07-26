import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { defaultDb } from '@note-first-presenter/client/dbSchema';
import { afterAll, describe, expect, it, vi } from 'vite-plus/test';
import { openSlides, type SlidesStatus } from '../../slides.ts';
import { withTempCwd } from '../../__tests__/helpers.ts';
import { createNfpDataMiddleware, createSlidesContext, ViteNfpPlugin } from '../plugin.ts';

const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');

withTempCwd('nfp-plugin-');

// ─── createSlidesContext ───────────────────────────────────────────────────

describe('createSlidesContext', () => {
  it('resolves to no-config-no-file when nothing exists', async () => {
    const ctx = await createSlidesContext();
    try {
      expect(ctx.getSlidesStatus()).toEqual({ kind: 'no-config-no-file' });
    } finally {
      await ctx.close();
    }
  });

  it('resolves a single PDF in cwd', async () => {
    await fs.copyFile(SAMPLE_PDF, path.resolve('slides.pdf'));
    const ctx = await createSlidesContext();
    try {
      expect(ctx.getSlidesStatus()).toEqual({
        kind: 'resolved',
        path: path.resolve('slides.pdf'),
      });
    } finally {
      await ctx.close();
    }
  });

  it('getSlides caches Slides instances per path', async () => {
    await fs.copyFile(SAMPLE_PDF, path.resolve('slides.pdf'));
    const ctx = await createSlidesContext();
    try {
      const a = ctx.getSlides(path.resolve('slides.pdf'));
      const b = ctx.getSlides(path.resolve('slides.pdf'));
      expect(a).toBe(b);
    } finally {
      await ctx.close();
    }
  });

  it('calls onSettle once after initial reload', async () => {
    const onSettle = vi.fn();
    const ctx = await createSlidesContext({ onSettle });
    try {
      expect(onSettle).toHaveBeenCalledTimes(1);
    } finally {
      await ctx.close();
    }
  });

  it('reports a failed reload via onError instead of rejecting, and degrades to no-config-no-file', async () => {
    // A config whose default export throws on load makes loadNfpConfig reject.
    await fs.writeFile('note-first-presenter.config.ts', 'throw new Error("boom");');
    const onSettle = vi.fn();
    const onError = vi.fn();
    const ctx = await createSlidesContext({ onSettle, onError });
    try {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onSettle).not.toHaveBeenCalled();
      expect(ctx.getSlidesStatus()).toEqual({ kind: 'no-config-no-file' });
    } finally {
      await ctx.close();
    }
  });

  it('close() resolves cleanly', async () => {
    const ctx = await createSlidesContext();
    await expect(ctx.close()).resolves.toBeUndefined();
  });

  it('detects a PDF added to cwd after startup', { timeout: 10_000 }, async () => {
    const ctx = await createSlidesContext();
    try {
      expect(ctx.getSlidesStatus()).toEqual({ kind: 'no-config-no-file' });
      await fs.copyFile(SAMPLE_PDF, path.resolve('slides.pdf'));
      await vi.waitFor(
        () => {
          expect(ctx.getSlidesStatus()).toEqual({
            kind: 'resolved',
            path: path.resolve('slides.pdf'),
          });
        },
        { timeout: 5000 },
      );
    } finally {
      await ctx.close();
    }
  });

  it('reloads when the resolved PDF changes right after settle', { timeout: 10_000 }, async () => {
    await fs.copyFile(SAMPLE_PDF, path.resolve('slides.pdf'));
    const onSettle = vi.fn();
    const ctx = await createSlidesContext({ onSettle });
    try {
      expect(onSettle).toHaveBeenCalledTimes(1);
      // Written immediately after settle, inside the window where the dynamic
      // watcher's initial scan may still be running.
      await fs.appendFile(path.resolve('slides.pdf'), ' ');
      await vi.waitFor(
        () => {
          expect(onSettle.mock.calls.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 5000 },
      );
    } finally {
      await ctx.close();
    }
  });

  it('detects a PDF removed from cwd', { timeout: 10_000 }, async () => {
    await fs.copyFile(SAMPLE_PDF, path.resolve('slides.pdf'));
    const ctx = await createSlidesContext();
    try {
      expect(ctx.getSlidesStatus()).toEqual({
        kind: 'resolved',
        path: path.resolve('slides.pdf'),
      });
      await fs.rm(path.resolve('slides.pdf'));
      await vi.waitFor(
        () => {
          expect(ctx.getSlidesStatus()).toEqual({ kind: 'no-config-no-file' });
        },
        { timeout: 5000 },
      );
    } finally {
      await ctx.close();
    }
  });
});

// ─── createNfpDataMiddleware ───────────────────────────────────────────────────

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
  return Object.assign(req, { method, url }) as unknown as Parameters<
    ReturnType<typeof createNfpDataMiddleware>
  >[0];
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

function asRes(res: MockResponse) {
  return res as unknown as Parameters<ReturnType<typeof createNfpDataMiddleware>>[1];
}

const NO_SLIDES: SlidesStatus = { kind: 'no-config-no-file' };

describe('createNfpDataMiddleware', () => {
  const mw = createNfpDataMiddleware({
    getSlidesStatus: () => NO_SLIDES,
    getSlides: () => {
      throw new Error('getSlides should not be called when slides are unresolved');
    },
  });

  it('GET /nfp-data/db.json on a missing db file returns 200 with empty db', async () => {
    const res = createMockRes();
    mw(createMockReq('GET', '/nfp-data/db.json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toEqual(defaultDb());
  });

  it('PUT /nfp-data/db.json with a valid body returns 204 and writes the file', async () => {
    const res = createMockRes();
    const db = { version: 1, title: 'x', outline: { type: 'doc', content: [] } };
    mw(createMockReq('PUT', '/nfp-data/db.json', JSON.stringify(db)), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(204);
    expect(res.body!.length).toBe(0);
    const written = JSON.parse(await fs.readFile('.note-first-presenter.json', 'utf8'));
    expect(written).toEqual(db);
  });

  it('PUT /nfp-data/db.json with an invalid body returns 400', async () => {
    const res = createMockRes();
    mw(
      createMockReq('PUT', '/nfp-data/db.json', JSON.stringify({ version: 2 })),
      asRes(res),
      () => {
        throw new Error('next should not be called');
      },
    );
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('PUT /nfp-data/db.json with malformed JSON returns 400', async () => {
    const res = createMockRes();
    mw(createMockReq('PUT', '/nfp-data/db.json', '{not json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('GET /nfp-data/meta.json with unresolved slides returns 200 with the status body', async () => {
    const res = createMockRes();
    mw(createMockReq('GET', '/nfp-data/meta.json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toEqual(NO_SLIDES);
  });

  it('calls next for a path outside /nfp-data/', async () => {
    const res = createMockRes();
    let nextCalled = false;
    mw(createMockReq('GET', '/whatever'), asRes(res), () => {
      nextCalled = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(nextCalled).toBe(true);
    expect(res.body).toBeUndefined();
  });
});

// ─── ViteNfpPlugin wiring ──────────────────────────────────────────────────

/**
 * Enough of a ViteDevServer for `configureServer`, plus a way to shut the
 * watchers down again — the plugin only exposes that through httpServer's
 * 'close' event, so the fake has to capture the listener.
 */
function createFakeServer(base: string) {
  const mounted: { route: unknown; handle: unknown }[] = [];
  let closeListener: (() => void) | undefined;
  const server = {
    middlewares: {
      use: (route: unknown, handle?: unknown) => {
        mounted.push({ route, handle });
      },
    },
    config: { base, logger: { error: () => {} } },
    ws: { send: () => {} },
    httpServer: {
      on: (event: string, cb: () => void) => {
        if (event === 'close') closeListener = cb;
      },
    },
  };
  return { server, mounted, close: () => closeListener?.() };
}

// The middleware is installed from configureServer, which Vite runs *before* it
// adds baseMiddleware — so under `--base /sub/` the URL still carries the base,
// and an unmounted handler matching a bare `/nfp-data/` would fall through to
// the SPA fallback and answer JSON requests with index.html. Moving the install
// to a post hook does not fix that either: Vite registers htmlFallbackMiddleware
// ahead of the post hooks. Mounting at the base is what makes connect strip the
// prefix, so the handler can stay base-unaware (docs/adr/0017).
describe('ViteNfpPlugin', () => {
  it('mounts the nfp-data middleware at the configured base', async () => {
    const { server, mounted, close } = createFakeServer('/sub/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake, see above
    await (ViteNfpPlugin().configureServer as any)(server);
    try {
      expect(mounted).toHaveLength(1);
      expect(mounted[0]!.route).toBe('/sub/');
      expect(typeof mounted[0]!.handle).toBe('function');
    } finally {
      close();
    }
  });

  it('mounts at the default base too, where connect makes it a no-op', async () => {
    const { server, mounted, close } = createFakeServer('/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake, see above
    await (ViteNfpPlugin().configureServer as any)(server);
    try {
      expect(mounted[0]!.route).toBe('/');
    } finally {
      close();
    }
  });
});

// ─── createNfpDataMiddleware slide images ──────────────────────────────────────
// Wires a real `Slides` over the sample PDF fixture to cover the branches the
// throw-on-getSlides stub above can't reach: hash matching, page validation,
// and the success/out-of-range response shapes.

describe('createNfpDataMiddleware slide images', () => {
  // An explicit cacheRoot sidesteps openSlides()'s cwd-relative default so
  // this describe doesn't need to chdir before constructing `slides`.
  const cacheRoot = mkdtempSync(path.join(tmpdir(), 'nfp-mw-cache-'));
  const slides = openSlides(SAMPLE_PDF, { cacheRoot });
  const mw = createNfpDataMiddleware({
    getSlidesStatus: () => ({ kind: 'resolved', path: SAMPLE_PDF }),
    getSlides: () => slides,
  });

  afterAll(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  });

  it('GET /nfp-data/meta.json with resolved slides returns 200 with the resolved meta', async () => {
    const { hash, pageCount } = await slides.meta();
    const res = createMockRes();
    mw(createMockReq('GET', '/nfp-data/meta.json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toMatchObject({ kind: 'resolved', hash, pageCount });
  });

  it('GET with a valid hash and page returns 200 with image headers', async () => {
    const { hash } = await slides.meta();
    const res = createMockRes();
    mw(createMockReq('GET', `/nfp-data/slides/${hash}/0001.webp`), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['etag']).toBe(`"${hash}-1"`);
    expect(res.body!.length).toBeGreaterThan(0);
  });

  it('GET with a mismatched hash returns 404', async () => {
    const res = createMockRes();
    mw(createMockReq('GET', '/nfp-data/slides/wronghash/0001.webp'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'hash mismatch' });
  });

  it('GET a page past the last page returns 404', async () => {
    const { hash } = await slides.meta();
    const res = createMockRes();
    mw(createMockReq('GET', `/nfp-data/slides/${hash}/0999.webp`), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'out of range' });
  });

  it('GET an unpadded page name returns 400 (only the static build’s names are served)', async () => {
    const { hash } = await slides.meta();
    const res = createMockRes();
    mw(createMockReq('GET', `/nfp-data/slides/${hash}/1.webp`), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'invalid page' });
  });

  it('GET page 0 returns 400', async () => {
    const { hash } = await slides.meta();
    const res = createMockRes();
    mw(createMockReq('GET', `/nfp-data/slides/${hash}/0000.webp`), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'invalid page' });
  });

  it('GET a slide image when slides are unresolved returns 404', async () => {
    const unresolvedMw = createNfpDataMiddleware({
      getSlidesStatus: () => NO_SLIDES,
      getSlides: () => {
        throw new Error('getSlides should not be called when slides are unresolved');
      },
    });
    const res = createMockRes();
    unresolvedMw(createMockReq('GET', '/nfp-data/slides/x/0001.webp'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body!.toString())).toEqual({ error: 'slides not available' });
  });
});
