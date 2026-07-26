import { atom, useAtomValue, useStore } from 'jotai';
import { selectAtom, unwrap } from 'jotai/utils';
import { useEffect, useState } from 'react';
import { type DbV1 } from '../../lib/dbSchema';
import { dataUrl } from '../../lib/routes';
import { api } from '../../lib/serverClient';
import { countNoteGroups } from '../outliner/noteGroups';

// One URL for both modes: in dev the CLI middleware answers it, in the static
// build it is a real file. GET and PUT differ only in method — read it as "the db
// document, whose static representation is a file".
const DB_URL = dataUrl('nfp-data/db.json');

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
 * There is no `lastError`: the only reader was a test, and the UI shows one
 * generic message off `saveStatus === 'error'`.
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
 * The stored document, fetched once.
 *
 * Reading it suspends, so only the gate below does. `main.tsx` reads it off
 * React so the request overlaps the page chunk's download instead of queueing
 * behind it.
 *
 * The response is trusted as-is: the CLI is the only other writer of the file
 * and it validates every PUT against this same schema at the trust boundary
 * (ADR-0013).
 */
export const storedDbAtom = /*#__PURE__*/ atom(() => api<DbV1>(DB_URL));

/** The stored document once it lands, as a value rather than a suspension. */
const settledStoredDbAtom = /*#__PURE__*/ unwrap(storedDbAtom);

/** Edits made in this session. `null` until the first one. */
const editsAtom = /*#__PURE__*/ atom<DbV1 | null>(null);

/**
 * The working document — what would be saved.
 *
 * Deliberately synchronous, which is the whole reason the stored document is a
 * separate atom: `selectAtom` hands its selector whatever `get` returns, and
 * `get` does not resolve promises, so a slice of an async atom is `undefined`
 * (`docs/adr/0018`). Everything fine-grained below therefore hangs off this one.
 *
 * `unwrap` is what makes the stored half readable synchronously — it answers
 * `undefined` until the request lands rather than suspending. So this is `null`
 * only in that window, and the gate below is what keeps the outline from being
 * drawn in it.
 *
 * The fallback is spelled here, in the graph, rather than seeded from the entry
 * point. An entry that forgot to seed would leave every reader looking at an
 * empty document with nothing failing — and the browser tests are exactly such
 * an entry.
 *
 * Not exported: outside this file the document is only ever read a slice at a
 * time, through the selectors below, and only ever written through
 * `useDbEditing`. Handing it out whole would make it possible to subscribe to
 * every keystroke by accident.
 */
const documentAtom = /*#__PURE__*/ atom(
  (get) => get(editsAtom) ?? get(settledStoredDbAtom) ?? null,
  (_get, set, next: DbV1) => {
    set(editsAtom, next);
  },
);

/** The presentation's title. Moves only when the title does, not on every keystroke. */
export const titleAtom = /*#__PURE__*/ selectAtom(documentAtom, (db) => db?.title ?? '');

/**
 * Half of the deck's length — the other half is the PDF's page count.
 *
 * Recomputed on every keystroke but compared with `Object.is`, so the slide list
 * is spared a re-render unless a `---` was added or removed. This replaces a
 * hand-written guard in the Editor that existed because React's bail-out on an
 * equal value lapses whenever the fiber already has another update pending; a
 * `selectAtom` that never bumps its own epoch has no such lapse.
 */
export const groupCountAtom = /*#__PURE__*/ selectAtom(documentAtom, (db) =>
  db ? countNoteGroups(db.outline) : 0,
);

async function saveDb(db: DbV1): Promise<void> {
  // keepalive so a save started on pagehide outlives the document.
  await api(DB_URL, { method: 'PUT', body: db, keepalive: true });
}

/**
 * Suspends until the stored document has landed, then hands it over.
 *
 * The one place that waits, and the reason the `status === 'ready'` guard that
 * used to be repeated at every call site is gone. It answers the *stored*
 * document rather than the working one on purpose: its only caller mounts the
 * outliner, which reads the outline once and owns it from then on. Subscribing
 * to the working document here would re-render this on every keystroke.
 */
export function useStoredDocument(): DbV1 {
  return useAtomValue(storedDbAtom);
}

export interface DbEditing {
  saveStatus: SaveStatus;
  setTitle: (title: string) => void;
  setOutline: (outline: unknown) => void;
}

/**
 * The Editor's write half: hand edits to the saver, and report how that went.
 *
 * Wiring only — the debounce, the retry and the coalescing all live in
 * `createDbSaver`, which stays outside the atom graph so that it remains
 * testable without a store and so that the Viewer's bundle never reaches it
 * (`docs/adr/0018`). Static builds drop this entire path, because the Editor
 * that calls it is behind `import.meta.env.DEV` in a component the Viewer never
 * renders.
 *
 * `setTitle` can be called before the document lands — the toolbar draws with
 * the shell, ahead of the panes — so the guard below is load-bearing.
 */
export function useDbEditing(): DbEditing {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // The store rather than `useAtomValue`: this hook writes the document on every
  // keystroke and must not subscribe to it, or the Editor would re-render for
  // each one — which is the cost the old `savedRef` existed to avoid.
  const store = useStore();
  const [saver] = useState(() => createDbSaver({ save: saveDb, onStatusChange: setSaveStatus }));

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

  const edit = (patch: Partial<DbV1>) => {
    const current = store.get(documentAtom);
    // Typing into the title before the load lands is dropped rather than merged.
    // Spreading `null` is not a type error and not a runtime one either — it
    // yields `{ ...patch }` — so without this the app would PUT a document with
    // no `version` and no `outline` over the real one, and `documentAtom` would
    // shadow the stored document from then on.
    if (!current) return;
    const next = { ...current, ...patch };
    store.set(documentAtom, next);
    saver.schedule(next);
  };

  return {
    saveStatus,
    setTitle: (title) => {
      edit({ title });
    },
    setOutline: (outline) => {
      edit({ outline });
    },
  };
}
