import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vite-plus/test';
import { emptyDb } from '../../db';
import { openSlides, type SlidesStatus } from '../../slides';
import { useTempCwd } from '../../../test/_helpers/use-temp-cwd';
import { handleApiRequest } from '../plugin';

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
    process.nextTick(() => req.push(null));
  }
  return Object.assign(req, { method, url }) as unknown as Parameters<
    ReturnType<typeof handleApiRequest>
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
  return res as unknown as Parameters<ReturnType<typeof handleApiRequest>>[1];
}

const NO_SLIDES: SlidesStatus = { kind: 'no-config-no-file' };

useTempCwd('nfp-api-');

describe('handleApiRequest', () => {
  it('GET /api/db on a missing db file returns 200 with empty db', async () => {
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
    const res = createMockRes();
    mw(createMockReq('GET', '/api/db'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body!.toString());
    expect(parsed).toEqual(emptyDb());
  });

  it('PUT /api/db with a valid body returns 204 and writes the file', async () => {
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
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
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', JSON.stringify({ version: 2 })), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/db with malformed JSON returns 400', async () => {
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
    const res = createMockRes();
    mw(createMockReq('PUT', '/api/db', '{not json'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/slides/meta with unresolved slides returns 422 with the status body', async () => {
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
    const res = createMockRes();
    mw(createMockReq('GET', '/api/slides/meta'), asRes(res), () => {
      throw new Error('next should not be called');
    });
    await res.done;
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body!.toString())).toEqual(NO_SLIDES);
  });

  it('calls next for a non-API path', async () => {
    const mw = handleApiRequest(() => NO_SLIDES, openSlides);
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
