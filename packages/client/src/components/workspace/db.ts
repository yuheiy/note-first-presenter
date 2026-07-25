import { useCallback, useEffect, useRef, useState } from 'react';
import { type DbV1 } from '../../lib/dbSchema';
import { api } from '../../lib/serverClient';
import { createResourceLoader, useResource, type Resource } from '../useResource';

// One URL for both modes: in dev the CLI middleware answers it, in the static
// build it is a real file. GET and PUT differ only in method — read it as "the db
// document, whose static representation is a file". See §2.2.
const DB_URL = '/nfp-data/db.json';

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
 * is what lets the Editor keep the outline in a ref rather than in state (§3.6).
 * There is no `lastError`: the only reader was a test, and the UI shows one
 * generic message off `saveStatus === 'error'` (§3.7).
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

/**
 * The stored document. Exported so `main.tsx` can fire the request before the
 * page chunk has finished downloading (§1.3); the hooks below then find it in
 * the cache rather than asking again.
 *
 * The response is trusted as-is: the CLI is the only other writer of the file
 * and it validates every PUT against this same schema at the trust boundary
 * (ADR-0013).
 */
export const loadDb = createResourceLoader(() => api<DbV1>(DB_URL));

async function saveDb(db: DbV1): Promise<void> {
  // keepalive so a save started on pagehide outlives the document.
  await api(DB_URL, { method: 'PUT', body: db, keepalive: true });
}

export interface EditableDb {
  status: Resource<DbV1>['status'];
  /** The stored outline. Only meaningful once `status` is `'ready'`. */
  initialOutline: unknown;
  title: string;
  saveStatus: SaveStatus;
  setTitle: (title: string) => void;
  setOutline: (outline: unknown) => void;
}

/**
 * The Editor's half of the db: load it, hold the title, save the edits.
 *
 * Wiring only — the debounce, the retry and the coalescing all live in
 * `createDbSaver`. Static builds drop this entire path, because the Editor that
 * calls it is behind `import.meta.env.DEV` in a component the Viewer never
 * renders (§3.4).
 */
export function useEditableDb(): EditableDb {
  const resource = useResource(loadDb);
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saverRef = useRef<DbSaver | null>(null);
  const saver = (saverRef.current ??= createDbSaver({
    save: saveDb,
    onStatusChange: setSaveStatus,
  }));

  // The document as it would be saved. A ref, not state: the outline changes on
  // every keystroke and nothing renders it — ProseMirror owns it (§3.6). It stays
  // null until the load lands, which is also the signal that an edit has
  // something to merge into.
  const savedRef = useRef<DbV1 | null>(null);
  const loaded = resource.status === 'ready' ? resource.data : null;
  if (loaded && !savedRef.current) savedRef.current = loaded;

  const setTitle = useCallback(
    (title: string) => {
      const saved = savedRef.current;
      // Typing into the title before the load lands is dropped rather than
      // merged: the alternative is saving a document whose outline is still the
      // empty default, over the real one.
      if (!saved) return;
      setEditedTitle(title);
      savedRef.current = { ...saved, title };
      saver.schedule(savedRef.current);
    },
    [saver],
  );

  const setOutline = useCallback(
    (outline: unknown) => {
      const saved = savedRef.current;
      if (!saved) return;
      savedRef.current = { ...saved, outline };
      saver.schedule(savedRef.current);
    },
    [saver],
  );

  // Flush before the page goes away, so an edit made inside the debounce window
  // is not lost. visibilitychange covers the mobile/background case that
  // pagehide misses.
  useEffect(() => {
    const flush = () => {
      void saver.flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saver]);

  return {
    status: resource.status,
    initialOutline: loaded ? loaded.outline : null,
    title: editedTitle ?? loaded?.title ?? '',
    saveStatus,
    setTitle,
    setOutline,
  };
}

/**
 * The Viewer's half: the same load, and nothing that writes.
 *
 * Static builds have no PUT route at all, and this is what keeps the Viewer from
 * ever reaching for one.
 */
export function useReadOnlyDb(): Resource<DbV1> {
  return useResource(loadDb);
}
