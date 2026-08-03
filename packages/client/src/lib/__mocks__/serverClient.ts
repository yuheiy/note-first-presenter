/**
 * Stand-in for `serverClient` in browser tests. A test file activates it with
 * a bare `vi.mock('<path to>/lib/serverClient')` — Vitest resolves this module
 * in its place — and configures it through the mutable `fakeServer` fields.
 * Vitest isolates test files, so each file talks to a fresh server.
 */
import type { DbV1 } from '../dbSchema';

export interface RecordedPut {
  title: string;
  outline: unknown;
}

/**
 * A stored db whose outline holds one top-level item per string. The non-empty
 * title keeps the Editor's fill-in-the-blank-title save out of the PUT counts.
 */
export function storedDb(texts: string[]): DbV1 {
  return {
    version: 1,
    title: 'Deck',
    outline: {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: texts.map((text) => ({
            type: 'list_item',
            attrs: { collapsed: false },
            content: [
              text
                ? { type: 'paragraph', content: [{ type: 'text', text }] }
                : { type: 'paragraph' },
            ],
          })),
        },
      ],
    },
  };
}

interface FakeServerState {
  /** Body served for GET db.json. */
  db: DbV1;
  /** Answer for GET meta.json; reassign to a thrower to simulate a transport failure. */
  meta: () => unknown;
  /**
   * When true, GET db.json stays open until `releaseDb()`. Held open rather
   * than delayed by a timer: the window then costs no wall clock, and a test
   * that forgets to look inside it cannot pass by accident on a slow machine.
   */
  holdDb: boolean;
  releaseDb: () => void;
  /** Every PUT body, in order. */
  puts: RecordedPut[];
  /** What `holdDb` gates; settled by `releaseDb`. Internal to `api`. */
  dbLanded: Promise<void>;
}

function createState(): FakeServerState {
  let releaseDb: () => void = () => {};
  const dbLanded = new Promise<void>((resolve) => {
    releaseDb = resolve;
  });
  return {
    db: storedDb(['']),
    meta: () => ({ kind: 'missing', path: 'slides.pdf' }),
    holdDb: false,
    releaseDb,
    puts: [],
    dbLanded,
  };
}

// Vitest evaluates this file twice within one test file's context: once as the
// module standing in for `serverClient`, and once through the test's own
// import that configures it. The state rides on globalThis so both copies talk
// to the same server; per-file isolation still holds because each test file
// gets its own JS context.
const NFP_FAKE_SERVER = '__nfp_fake_server__';
const globalRef = globalThis as { [NFP_FAKE_SERVER]?: FakeServerState };
export const fakeServer = (globalRef[NFP_FAKE_SERVER] ??= createState());

export const api = async (
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<unknown> => {
  if (url.endsWith('meta.json')) return fakeServer.meta();
  if (options?.method === 'PUT') {
    fakeServer.puts.push(options.body as RecordedPut);
    return undefined;
  }
  if (fakeServer.holdDb) await fakeServer.dbLanded;
  return fakeServer.db;
};
