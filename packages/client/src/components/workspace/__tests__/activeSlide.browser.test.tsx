import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { render } from 'vitest-browser-react';
import { Editor } from '../Editor';

/**
 * G3 — the correspondence between note groups and slides — as wiring: picking a
 * slide has to move the caret, and moving the caret has to move the selection.
 *
 * Both directions in one file because the echo suppression only breaks when both
 * are live: each direction on its own looks correct while the pair oscillates
 * (§8.4).
 *
 * The outline opens with a separator, which is what makes the third test
 * possible — group 1 is then empty, the case §4.5 says the suppression exists
 * for.
 */

const server = vi.hoisted(() => {
  const items = ['---', 'alpha', '---', 'beta'];
  const stored = {
    version: 1,
    title: 'Deck',
    outline: {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: items.map((text) => ({
            type: 'list_item',
            attrs: { collapsed: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
      ],
    },
  };
  return {
    api: (url: string, options?: { method?: string }) => {
      if (url === '/nfp-data/db.json') {
        return options?.method === 'PUT' ? Promise.resolve(undefined) : Promise.resolve(stored);
      }
      // `pageCount: 0` still resolves the deck, so the slide list renders — with
      // every row an overflow placeholder rather than an <img> pointing at a
      // slide image this test has no server for.
      return Promise.resolve({ kind: 'resolved', hash: 'testhash', pageCount: 0 });
    },
  };
});

vi.mock('../../../lib/serverClient', () => ({ api: server.api }));

/** The outline items the editor is currently marking as the active slide's. */
function highlightedItems(): string[] {
  return [...document.querySelectorAll('li[data-active-slide="true"] > p')].map(
    (el) => el.textContent ?? '',
  );
}

/** The slide numbers the list is currently showing as selected. */
function selectedSlides(): string[] {
  return [...document.querySelectorAll('[role="option"][aria-selected="true"]')].map(
    (el) => el.getAttribute('data-slide') ?? '',
  );
}

/**
 * Waits out anything the click set in motion. `expect.poll` cannot express "and
 * then nothing else happened" — it resolves on the first reading that matches,
 * which is the reading taken before an echo would arrive.
 */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

async function renderEditor() {
  // Locale pinned globally in vitest-setup.browser.ts; see the note there.
  const screen = await render(
    <StrictMode>
      <Editor />
    </StrictMode>,
  );
  await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
  return screen;
}

describe('active slide', () => {
  beforeEach(() => {
    // `useActiveSlide` reads and writes `?slide=`, so without this each test
    // would start wherever the last one left off.
    history.replaceState(null, '', location.pathname);
  });

  it('has one option per note group', async () => {
    const screen = await renderEditor();
    // Three groups from two separators, and no PDF pages to outnumber them.
    await expect.poll(() => screen.getByRole('option').elements().length).toBe(3);
    // Every row is a placeholder, this deck having no pages. Spelled in English
    // because vitest-setup.browser.ts pins the locale — a real Chromium follows
    // the system's, so without that pin this line would read differently per
    // machine.
    await expect.element(screen.getByRole('option').nth(0)).toHaveTextContent('Slide 1 (overflow)');
  });

  it('moves the caret into the group of the slide picked in the list', async () => {
    const screen = await renderEditor();
    await expect.poll(() => screen.getByRole('option').elements().length).toBe(3);

    await userEvent.click(screen.getByRole('option').nth(2));

    await expect.poll(highlightedItems).toEqual(['beta']);
  });

  it('selects the slide of the group the caret is moved into', async () => {
    const screen = await renderEditor();
    await expect.poll(() => screen.getByRole('option').elements().length).toBe(3);

    await userEvent.click(screen.getByText('alpha'));

    await expect.poll(selectedSlides).toEqual(['2']);
  });

  it('stays on a slide whose note group is empty', async () => {
    const screen = await renderEditor();
    await expect.poll(() => screen.getByRole('option').elements().length).toBe(3);
    await userEvent.click(screen.getByRole('option').nth(2));
    await expect.poll(highlightedItems).toEqual(['beta']);

    await userEvent.click(screen.getByRole('option').nth(0));

    // Group 1 is empty, so the caret has nowhere of its own to land: it snaps
    // forward into the leading separator's paragraph, which reads as group 2.
    // The move carries the echo meta, so the editor does not report it back —
    // without that, picking slide 1 would be answered with "2" and the selection
    // would be pushed off the slide that was just picked (§4.5).
    await settle();
    expect(selectedSlides()).toEqual(['1']);
  });
});
