import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vite-plus/test';
import type { SlidesStatus } from '../../config/resolve-slides-path';
import { type ApiContext, createApiMiddleware } from '../api';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | undefined;
  setHeader(name: string, value: string): void;
  end(chunk?: string | Buffer): void;
  done: Promise<void>;
}

function createMockReq(method: string, url: string, body?: string) {
  const req = body == null ? new Readable({ read() {} }) : Readable.from([Buffer.from(body)]);
  if (body == null) {
    // No body: end the stream immediately for 'end' listeners.
    process.nextTick(() => req.push(null));
  }
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

async function mkCtx(overrides?: Partial<ApiContext>): Promise<ApiContext> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-api-'));
  return {
    dbPath: path.join(dir, '.note-first-presenter.json'),
    cacheRoot: path.join(dir, 'cache'),
    slidesStatus: { kind: 'no-config-no-file' },
    ...overrides,
  };
}

describe('createApiMiddleware', () => {
  it('GET /api/db on a missing dbPath returns 200 with empty db', async () => {
    const ctx = await mkCtx();
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    mw(createMockReq('GET', '/api/db'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body!.toString());
    expect(parsed).toEqual({ version: 1, title: '', outline: { type: 'doc', content: [] } });
  });

  it('PUT /api/db with a valid body returns 204 and writes the file', async () => {
    const ctx = await mkCtx();
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    const db = { version: 1, title: 'x', outline: { type: 'doc', content: [] } };
    mw(createMockReq('PUT', '/api/db', JSON.stringify(db)), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(204);
    expect(res.body!.length).toBe(0);
    const written = JSON.parse(await fs.readFile(ctx.dbPath, 'utf8'));
    expect(written).toEqual(db);
  });

  it('PUT /api/db with an invalid body returns 400', async () => {
    const ctx = await mkCtx();
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', JSON.stringify({ version: 2 })), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/db with malformed JSON returns 400', async () => {
    const ctx = await mkCtx();
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', '{not json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/slides/meta with unresolved slides returns 422 with the status body', async () => {
    const slidesStatus: SlidesStatus = { kind: 'no-config-no-file' };
    const ctx = await mkCtx({ slidesStatus });
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    mw(createMockReq('GET', '/api/slides/meta'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body!.toString())).toEqual(slidesStatus);
  });

  it('calls next for a non-API path', async () => {
    const ctx = await mkCtx();
    const mw = createApiMiddleware(() => ctx);
    const res = createMockRes();
    let nextCalled = false;
    mw(createMockReq('GET', '/whatever'), asRes(res), () => {
      nextCalled = true;
    });
    // Give any async path a tick to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(nextCalled).toBe(true);
    expect(res.body).toBeUndefined();
  });
});
