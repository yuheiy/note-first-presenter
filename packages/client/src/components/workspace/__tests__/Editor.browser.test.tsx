import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { renderEditor } from '../../../__tests__/renderEditor';
import { fakeServer } from '../../../lib/__mocks__/serverClient';
import { docToItems } from '../../outliner/jsonDoc';
import { SAVE_DEBOUNCE_MS } from '../dbSaver';

vi.mock('../../../lib/serverClient');

/**
 * G1 — "the manuscript survives" — as it looks once React is holding the wires:
 * whatever the editor is showing has to reach the PUT body, exactly once, no
 * matter how many times React mounts or re-renders the tree. This failure is
 * silent by nature (the edit stays on screen; only the write is lost), which is
 * what earns it a browser test while theming and the URL mirror get none.
 *
 * Everything renders under `<StrictMode>`, as the app does: the doubled mount is
 * half of what is under test here.
 */

/** The text of each top-level outline item, read out of a saved PUT body. */
function savedTexts(outline: unknown): string[] {
  return docToItems(outline).map((item) =>
    (item.content?.[0]?.content ?? []).map((node) => node.text ?? '').join(''),
  );
}

async function renderAndFocus() {
  const screen = await renderEditor();
  const outliner = screen.getByRole('textbox', { name: 'Outliner' });
  await userEvent.click(outliner);
  return outliner;
}

describe('Editor', () => {
  beforeEach(() => {
    fakeServer.puts.length = 0;
  });

  it('saves what was typed, once, when the debounce elapses', async () => {
    await renderAndFocus();

    await userEvent.keyboard('hello world');

    await expect.poll(() => fakeServer.puts.length, { timeout: 5000 }).toBe(1);
    // Exactly one, not merely at least one: StrictMode mounts the tree twice, so
    // a save pipeline built without a guard would be built twice over and write
    // every edit twice.
    expect(savedTexts(fakeServer.puts[0]?.outline)).toEqual(['hello world']);
  });

  it('keeps saving after an edit re-renders the shell', async () => {
    await renderAndFocus();

    // A separator adds a note group, and that number is state the Workspace
    // renders — so this edit goes out through the shell and back, which the
    // straight-line case above never touches. What is being watched is that the
    // saved outline is still the whole outline afterwards.
    //
    // Note this does *not* exercise the stale-closure hazard: the callback
    // reaching the EditorView closes over `setOutline` and a setState, both
    // already stable, so freezing the first render's copy changes nothing that
    // is observable here. useEffectEvent is what keeps that true as the Editor
    // grows, not something a test can currently see.
    await userEvent.keyboard('one{Enter}---{Enter}two');

    await expect
      .poll(() => savedTexts(fakeServer.puts.at(-1)?.outline), { timeout: 5000 })
      .toEqual(['one', '---', 'two']);
  });

  it('flushes a pending edit when the page goes away', async () => {
    await renderAndFocus();
    await userEvent.keyboard('unsaved');

    window.dispatchEvent(new Event('pagehide'));

    // Deliberately shorter than the debounce: waiting past it would pass whether
    // pagehide flushed or the timer simply came round.
    await expect
      .poll(() => fakeServer.puts.length, { timeout: SAVE_DEBOUNCE_MS / 2, interval: 10 })
      .toBe(1);
    expect(savedTexts(fakeServer.puts[0]?.outline)).toEqual(['unsaved']);
  });
});
