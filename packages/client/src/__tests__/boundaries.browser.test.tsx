/**
 * What the Suspense and error boundaries are for, held in place.
 *
 * Every case here is a regression that the first cut of `docs/adr/0018` actually
 * had, and that nothing else in the suite noticed: the app renders identically
 * once both local files have landed, and locally they land in milliseconds. What
 * is under test is only the window before that, and the window where a request
 * fails — so `api` is stubbed to hold `db.json` open for three seconds and to
 * fail `meta.json` on demand.
 *
 * Lives above `components/` because the contract spans both pages.
 */
import { createStore, Provider } from 'jotai';
import { StrictMode, Suspense, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { render } from 'vitest-browser-react';
import { Editor } from '../components/workspace/Editor';
import Slideshow from '../pages/Slideshow';

/** Long enough that every assertion below lands inside the loading window. */
const DB_DELAY_MS = 3000;

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
  const puts: unknown[] = [];
  return {
    puts,
    failMeta: false,
    api: async (url: string, options?: { method?: string; body?: unknown }) => {
      if (url === '/nfp-data/meta.json') {
        if (server.failMeta) throw new Error('Network request failed');
        return { kind: 'no-config-no-file' };
      }
      if (options?.method === 'PUT') {
        puts.push(options.body);
        return undefined;
      }
      await new Promise((resolve) => setTimeout(resolve, DB_DELAY_MS));
      return stored;
    },
  };
});
vi.mock('../lib/serverClient', () => ({ api: server.api }));

/**
 * `main.tsx`'s shape: one coarse Suspense above the page and no ErrorBoundary at
 * all. Reproducing it is the point — the boundaries being tested are the ones
 * *below* here, and a fallback that reached this one would mean the page went
 * blank.
 */
function renderPage(page: ReactNode) {
  return render(
    <StrictMode>
      <Provider store={createStore()}>
        <Suspense fallback={<div data-testid="entry-fallback" />}>{page}</Suspense>
      </Provider>
    </StrictMode>,
  );
}

/** Long enough to be past the save debounce, short of `DB_DELAY_MS`. */
function midLoad() {
  return new Promise((resolve) => setTimeout(resolve, DB_DELAY_MS / 4));
}

beforeEach(() => {
  server.failMeta = false;
  server.puts.length = 0;
});

describe('the workspace shell', () => {
  it('is on screen before the document lands', async () => {
    const screen = await renderPage(<Editor />);
    await midLoad();

    // A slot is still a child: without a Suspense boundary inside the shell, the
    // outliner's wait travels up to the entry's and takes the toolbar and the
    // theme footer with it.
    expect({
      toolbar: screen.getByRole('textbox', { name: 'Title' }).elements().length,
      themeGroup: screen.getByRole('radiogroup').elements().length,
      entryFallback: screen.getByTestId('entry-fallback').elements().length,
    }).toEqual({ toolbar: 1, themeGroup: 1, entryFallback: 0 });
  });

  it('survives a metadata request that fails', async () => {
    server.failMeta = true;
    const screen = await renderPage(<Editor />);
    await midLoad();

    // `--slide-aspect` is read in the shell itself, above every boundary the app
    // has. `unwrap` rethrows a rejection rather than swallowing it, so that read
    // has to answer with the default instead of throwing.
    expect({
      toolbar: screen.getByRole('textbox', { name: 'Title' }).elements().length,
      themeGroup: screen.getByRole('radiogroup').elements().length,
      entryFallback: screen.getByTestId('entry-fallback').elements().length,
    }).toEqual({ toolbar: 1, themeGroup: 1, entryFallback: 0 });
  });
});

describe('the title field, before the document lands', () => {
  it('drops the edit rather than saving a document composed out of null', async () => {
    const screen = await renderPage(<Editor />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    await expect.element(field).toBeInTheDocument();

    await userEvent.click(field);
    await userEvent.keyboard('oops');
    await midLoad();

    // Spreading `null` is neither a type error nor a runtime one — it yields
    // `{ ...patch }` — so the guard that stops this is invisible to every other
    // check in the repo. What it prevents is a PUT with no `version` and no
    // `outline` landing on top of the real document.
    expect(server.puts).toEqual([]);
  });
});

describe('the slideshow', () => {
  it('says why rather than going blank when the metadata cannot be fetched', async () => {
    server.failMeta = true;
    const screen = await renderPage(<Slideshow />);

    // Its own words, because a failure to reach the server has no message of
    // ours to show. The page used to render this off `describeSlidesMeta`'s
    // second argument; it is a boundary's business now.
    await expect.element(screen.getByText('Network request failed')).toBeInTheDocument();
  });
});
