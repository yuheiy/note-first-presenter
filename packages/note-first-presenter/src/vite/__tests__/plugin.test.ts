import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vite-plus/test';
import { emptyDb } from '../../db';
import { type SlidesStatus } from '../../slides';
import { useTempCwd } from '../../__tests__/helpers';
import { createApiMiddleware, createSlidesContext } from '../plugin';

const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');

useTempCwd('nfp-plugin-');

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
});

// ─── createApiMiddleware ───────────────────────────────────────────────────

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
    ReturnType<typeof createApiMiddleware>
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
  return res as unknown as Parameters<ReturnType<typeof createApiMiddleware>>[1];
}

const NO_SLIDES: SlidesStatus = { kind: 'no-config-no-file' };

describe('createApiMiddleware', () => {
  const mw = createApiMiddleware({
    getSlidesStatus: () => NO_SLIDES,
    getSlides: () => {
      throw new Error('getSlides should not be called when slides are unresolved');
    },
  });

  it('GET /api/db on a missing db file returns 200 with empty db', async () => {
    const res = createMockRes();
    mw(createMockReq('GET', '/api/db'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!.toString())).toEqual(emptyDb());
  });

  it('PUT /api/db with a valid body returns 204 and writes the file', async () => {
    const res = createMockRes();
    const db = { version: 1, title: 'x', outline: { type: 'doc', content: [] } };
    mw(createMockReq('PUT', '/api/db', JSON.stringify(db)), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(204);
    expect(res.body!.length).toBe(0);
    const written = JSON.parse(await fs.readFile('.note-first-presenter.json', 'utf8'));
    expect(written).toEqual(db);
  });

  it('PUT /api/db with an invalid body returns 400', async () => {
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', JSON.stringify({ version: 2 })), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/db with malformed JSON returns 400', async () => {
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', '{not json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/slides/meta with unresolved slides returns 422 with the status body', async () => {
    const res = createMockRes();
    mw(createMockReq('GET', '/api/slides/meta'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body!.toString())).toEqual(NO_SLIDES);
  });

  it('calls next for a non-API path', async () => {
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
