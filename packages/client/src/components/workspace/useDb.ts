import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { type DbV1 } from '../../lib/dbSchema';
import { editDocumentAtom, saveDb, storedDbAtom } from './db';
import { createDbSaver, type SaveStatus } from './dbSaver';

/**
 * Suspends until the stored document has landed, then hands it over — the one
 * way to wait for it.
 *
 * It answers the *stored* document rather than the working one on purpose —
 * callers either read the outline once and own it from then on, or want the
 * suspension and not the value. Subscribing to the working document here would
 * re-render every one of them per keystroke.
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
 * `setTitle` can be called before the document lands — the toolbar draws with the
 * shell, ahead of the panes — which is what `documentAtom`'s writer guards.
 */
export function useDbEditing(): DbEditing {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // `useSetAtom`, not `useAtomValue`: this hook writes the document on every
  // keystroke and must not subscribe to it, or the Editor would re-render for
  // each one.
  const editDocument = useSetAtom(editDocumentAtom);
  const [saver] = useState(() => createDbSaver({ save: saveDb, onStatusChange: setSaveStatus }));

  // Flush before the page goes away, so an edit made inside the debounce window
  // is not lost. visibilitychange covers the mobile/background case that
  // pagehide misses. The cleanup flushes too: unmounting removes the listeners,
  // so a pending edit would otherwise be stranded. The saver itself is *not*
  // torn down — under StrictMode the same instance is reused across the doubled
  // setup/cleanup/setup — and a flush with nothing pending is a no-op.
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
      void saver.flush();
    };
  }, [saver]);

  // Nothing to save when the atom answers nothing: the title can be typed into
  // before the document lands, and that edit is dropped rather than merged.
  const edit = (patch: Partial<DbV1>) => {
    const next = editDocument(patch);
    if (next) saver.schedule(next);
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
