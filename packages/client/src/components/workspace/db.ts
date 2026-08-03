import { atom } from 'jotai';
import { selectAtom, unwrap } from 'jotai/utils';
import { type DbV1 } from '../../lib/dbSchema';
import { dataUrl } from '../../lib/routes';
import { api } from '../../lib/serverClient';

// One URL for both modes: in dev the CLI middleware answers it, in the static
// build it is a real file. GET and PUT differ only in method — read it as "the db
// document, whose static representation is a file".
const DB_URL = dataUrl('nfp-data/db.json');

/**
 * The stored document, fetched once.
 *
 * Reading it suspends, so only whoever waits on it does. `main.tsx` reads it off
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
 * Deliberately synchronous: a slice of an async atom is `undefined`, so
 * everything fine-grained below hangs off this one (`docs/adr/0018`). `unwrap`
 * makes the stored half readable synchronously — it answers `undefined` until
 * the request lands — so this is `null` only in that window.
 *
 * The fallback is spelled here, in the graph, rather than seeded from the entry
 * point. An entry that forgot to seed would leave every reader looking at an
 * empty document with nothing failing — and the browser tests are exactly such
 * an entry.
 *
 * Not exported: outside this file the document is only ever read a slice at a
 * time, through the selectors below, and only ever written through
 * `editDocumentAtom`. Handing it out whole would make it possible to subscribe
 * to every keystroke by accident.
 *
 * The writer takes a patch and answers the merged document, or nothing if there
 * was none to merge into. Both halves belong here rather than in the hook: it
 * makes "the working document is never composed out of `null`" a property of the
 * graph rather than of whoever remembers to check. Spreading `null` is neither
 * a type error nor a runtime one — it yields `{ ...patch }` — so without the
 * guard a title typed before the load would PUT a document with no `version`
 * and no `outline` over the real one.
 */
const documentAtom = /*#__PURE__*/ atom(
  (get) => get(editsAtom) ?? get(settledStoredDbAtom) ?? null,
  (get, set, patch: Partial<DbV1>): DbV1 | undefined => {
    const current = get(editsAtom) ?? get(settledStoredDbAtom);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    set(editsAtom, next);
    return next;
  },
);

/**
 * The working document's write half, and nothing else. Write-only on purpose:
 * reading it is an error, so exporting it — which the hooks module needs —
 * still hands nobody a way to subscribe to the document whole.
 */
export const editDocumentAtom = /*#__PURE__*/ atom(
  null,
  (get, set, patch: Partial<DbV1>): DbV1 | undefined => set(documentAtom, patch),
);

/** The presentation's title. Moves only when the title does, not on every keystroke. */
export const titleAtom = /*#__PURE__*/ selectAtom(documentAtom, (db) => db?.title ?? '');

/**
 * The outline alone, so that counting note groups off it (`slides/deck.ts`) is
 * not on the title's path: `Object.is` on the outline reference short-circuits
 * every title keystroke.
 *
 * Exported rather than counted here so that `db.ts` — which `main.tsx` imports
 * eagerly — does not pull the outliner's modules into the entry chunk. The
 * slideshow window would otherwise download them for nothing.
 */
export const outlineAtom = /*#__PURE__*/ selectAtom(documentAtom, (db) => db?.outline ?? null);

export async function saveDb(db: DbV1): Promise<void> {
  // keepalive so a save started on pagehide outlives the document.
  await api(DB_URL, { method: 'PUT', body: db, keepalive: true });
}
