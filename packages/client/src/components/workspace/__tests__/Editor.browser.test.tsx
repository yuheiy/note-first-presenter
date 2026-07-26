import { StrictMode } from 'react';
import { I18nProvider } from 'react-aria-components';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { render } from 'vitest-browser-react';
import { docToItems } from '../../outliner/jsonDoc';
import { SAVE_DEBOUNCE_MS } from '../db';
import { Editor } from '../Editor';

/**
 * G1 — "the manuscript survives" — as it looks once React is holding the wires:
 * whatever the editor is showing has to reach the PUT body, exactly once, no
 * matter how many times React mounts or re-renders the tree. This failure is
 * silent by nature (the edit stays on screen; only the write is lost), which is
 * what earns it a browser test while theming and the URL mirror get none (§8.1).
 *
 * Everything renders under `<StrictMode>`, as the app does: the doubled mount is
 * half of what is under test here.
 */

// One db for the whole file: `loadDb` caches its request per module, so every
// render below starts from these same bytes. A non-empty title keeps the
// Editor's fill-in-the-blank-title save out of the counts.
const server = vi.hoisted(() => {
  const stored = {
    version: 1,
    title: 'Deck',
    outline: {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', attrs: { collapsed: false }, content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    },
  };
  const puts: { title: string; outline: unknown }[] = [];
  return {
    puts,
    api: (url: string, options?: { method?: string; body?: unknown }) => {
      if (url !== '/nfp-data/db.json') return Promise.resolve({ kind: 'no-config-no-file' });
      if (options?.method !== 'PUT') return Promise.resolve(stored);
      puts.push(options.body as { title: string; outline: unknown });
      return Promise.resolve(undefined);
    },
  };
});

vi.mock('../../../lib/serverClient', () => ({ api: server.api }));

/** The text of each top-level outline item, read out of a saved PUT body. */
function savedTexts(outline: unknown): string[] {
  return docToItems(outline).map((item) =>
    (item.content?.[0]?.content ?? []).map((node) => node.text ?? '').join(''),
  );
}

async function renderEditor() {
  const screen = await render(
    <StrictMode>
      {/* The app reads `navigator.language`; a real Chromium has no fixed one,
          so the locale is pinned here and the expectations below are written in
          English literals rather than read back out of the catalog (§8.6). */}
      <I18nProvider locale="en-US">
        <Editor />
      </I18nProvider>
    </StrictMode>,
  );
  const outliner = screen.getByRole('textbox', { name: 'Outliner' });
  // The editor is mounted only once the document has landed (§4.4).
  await expect.element(outliner).toBeInTheDocument();
  await userEvent.click(outliner);
  return outliner;
}

describe('Editor', () => {
  beforeEach(() => {
    server.puts.length = 0;
  });

  it('saves what was typed, once, when the debounce elapses', async () => {
    await renderEditor();

    await userEvent.keyboard('hello world');

    await expect.poll(() => server.puts.length, { timeout: 5000 }).toBe(1);
    // Exactly one, not merely at least one: StrictMode mounts the tree twice, so
    // a save pipeline built without a guard would be built twice over and write
    // every edit twice (§3.7).
    expect(savedTexts(server.puts[0]?.outline)).toEqual(['hello world']);
  });

  it('keeps saving after an edit re-renders the shell', async () => {
    await renderEditor();

    // A separator adds a note group, and that number is state the Workspace
    // renders — so this edit goes out through the shell and back, which the
    // straight-line case above never touches. What is being watched is that the
    // saved outline is still the whole outline afterwards (§3.6).
    //
    // Note this does *not* exercise §4.3's stale-closure hazard: the callback
    // reaching the EditorView closes over `setOutline` and a setState, both
    // already stable, so freezing the first render's copy changes nothing that
    // is observable here. useEffectEvent is what keeps that true as the Editor
    // grows, not something a test can currently see.
    await userEvent.keyboard('one{Enter}---{Enter}two');

    await expect
      .poll(() => savedTexts(server.puts.at(-1)?.outline), { timeout: 5000 })
      .toEqual(['one', '---', 'two']);
  });

  it('flushes a pending edit when the page goes away', async () => {
    await renderEditor();
    await userEvent.keyboard('unsaved');

    window.dispatchEvent(new Event('pagehide'));

    // Deliberately shorter than the debounce: waiting past it would pass whether
    // pagehide flushed or the timer simply came round.
    await expect
      .poll(() => server.puts.length, { timeout: SAVE_DEBOUNCE_MS / 2, interval: 10 })
      .toBe(1);
    expect(savedTexts(server.puts[0]?.outline)).toEqual(['unsaved']);
  });
});
