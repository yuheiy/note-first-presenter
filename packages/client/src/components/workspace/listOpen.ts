import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nfp:listOpen';

export function readListOpen(): boolean {
  // Open is the default, including the first visit and any unreadable value.
  return (localStorage.getItem(STORAGE_KEY) ?? 'true') === 'true';
}

export function writeListOpen(open: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(open));
}

/**
 * Whether the slide list panel is showing, persisted per browser.
 *
 * Same shape as `useTheme` and for the same reason: this side is the only writer
 * of the key.
 */
export function useListOpen(): [boolean, (open: boolean) => void] {
  const [listOpen, setListOpen] = useState(readListOpen);

  useEffect(() => {
    writeListOpen(listOpen);
  }, [listOpen]);

  return [listOpen, setListOpen];
}
