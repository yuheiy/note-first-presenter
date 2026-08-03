import { type DbV1 } from '../../lib/dbSchema';

export const SAVE_DEBOUNCE_MS = 500;
export const SAVE_RETRY_MS = 5000;

export type SaveStatus = 'idle' | 'saving' | 'error';

export interface DbSaverOptions {
  save: (db: DbV1) => Promise<void>;
  onStatusChange?: (status: SaveStatus) => void;
}

export interface DbSaver {
  /** Queue `db` to be saved; rapid edits coalesce into one request. */
  schedule: (db: DbV1) => void;
  /** Send whatever is queued right now, for teardown paths that cannot wait. */
  flush: () => Promise<void>;
}

/**
 * The save pipeline: debounce, coalesce, retry — with no React in it.
 *
 * It holds no document of its own. Callers hand it the whole db each time, which
 * is what keeps it outside the atom graph — testable without a store, and absent
 * from the Viewer's bundle (`docs/adr/0018`).
 */
export function createDbSaver({ save, onStatusChange }: DbSaverOptions): DbSaver {
  let pending: DbV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight = false;
  let status: SaveStatus = 'idle';

  function setStatus(next: SaveStatus) {
    if (next === status) return;
    status = next;
    onStatusChange?.(next);
  }

  function armTimer(delay: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // A flush during an in-flight save needs no timer of its own: the loop below
    // picks up whatever was queued meanwhile before it settles.
    if (inflight || !pending) return;
    inflight = true;
    try {
      while (pending) {
        const db = pending;
        pending = null;
        setStatus('saving');
        try {
          await save(db);
        } catch {
          // Put the document back unless a newer one arrived while this one was
          // failing, then retry on a timer. The next edit re-arms it sooner.
          pending ??= db;
          setStatus('error');
          armTimer(SAVE_RETRY_MS);
          return;
        }
      }
      setStatus('idle');
    } finally {
      inflight = false;
    }
  }

  return {
    schedule(db) {
      pending = db;
      armTimer(SAVE_DEBOUNCE_MS);
    },
    flush,
  };
}
