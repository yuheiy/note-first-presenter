/**
 * What the Suspense and error boundaries are for, held in place.
 *
 * Every case here is a regression that the first cut of `docs/adr/0018` actually
 * had, and that nothing else in the suite noticed: the app renders identically
 * once both local files have landed, and locally they land in milliseconds. What
 * is under test is only the window before that, and the window where a request
 * fails — so the fake server holds `db.json` open for the whole file and fails
 * `meta.json` on demand.
 *
 * Lives above `components/` because the contract spans both pages.
 */
import { createStore, Provider } from 'jotai';
import { StrictMode, Suspense, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { render } from 'vitest-browser-react';
import { fakeServer } from '../lib/__mocks__/serverClient';
import { SAVE_DEBOUNCE_MS } from '../components/workspace/dbSaver';
import { Editor } from '../components/workspace/Editor';
import Slideshow from '../pages/Slideshow';

vi.mock('../lib/serverClient');

fakeServer.holdDb = true;

/**
 * `main.tsx`'s shape: one coarse Suspense above the page and no ErrorBoundary at
 * all. Reproducing it is the point — the boundaries being tested are the ones
 * *below* here, and a fallback that reached this one would mean the page went
 * blank. A store per render, for the reason `renderEditor`'s docblock gives.
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

/**
 * What the shell must look like whatever the requests are doing: everything the
 * page owns is drawn, and the entry's boundary — which stands in for the whole
 * document going blank — has not been reached.
 */
function shell(screen: Awaited<ReturnType<typeof renderPage>>) {
  return {
    toolbar: screen.getByRole('textbox', { name: 'Title' }).elements().length,
    themeGroup: screen.getByRole('radiogroup').elements().length,
    entryFallback: screen.getByTestId('entry-fallback').elements().length,
  };
}

const SHELL_STANDING = { toolbar: 1, themeGroup: 1, entryFallback: 0 };

const failMeta = () => {
  throw new Error('Network request failed');
};

beforeEach(() => {
  fakeServer.meta = () => ({ kind: 'missing', path: 'slides.pdf' });
  fakeServer.puts.length = 0;
});

describe('the workspace shell', () => {
  it('is on screen before the document lands', async () => {
    const screen = await renderPage(<Editor />);

    // A slot is still a child: without a Suspense boundary inside the shell, the
    // outliner's wait travels up to the entry's and takes the toolbar and the
    // theme footer with it.
    await expect.poll(() => shell(screen)).toEqual(SHELL_STANDING);
  });

  it('survives a metadata request that fails', async () => {
    fakeServer.meta = failMeta;
    const screen = await renderPage(<Editor />);

    // `--slide-aspect` is read in the shell itself, above every boundary the app
    // has. `unwrap` rethrows a rejection rather than swallowing it, so that read
    // has to answer with the default instead of throwing.
    await expect.poll(() => shell(screen)).toEqual(SHELL_STANDING);
  });
});

describe('the title field, before the document lands', () => {
  it('drops the edit rather than saving a document composed out of null', async () => {
    const screen = await renderPage(<Editor />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    await expect.element(field).toBeInTheDocument();

    await userEvent.click(field);
    await userEvent.keyboard('oops');
    // Past the save debounce, with the document still held open.
    await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100));

    // Spreading `null` is neither a type error nor a runtime one — it yields
    // `{ ...patch }` — so the guard that stops this is invisible to every other
    // check in the repo. What it prevents is a PUT with no `version` and no
    // `outline` landing on top of the real document.
    expect(fakeServer.puts).toEqual([]);
  });
});

describe('the slideshow', () => {
  it('says why rather than going blank when the metadata cannot be fetched', async () => {
    fakeServer.meta = failMeta;
    const screen = await renderPage(<Slideshow />);

    // Its own words, because a failure to reach the server has no message of
    // ours to show — drawing it is the boundary's business.
    await expect.element(screen.getByText('Network request failed')).toBeInTheDocument();
  });
});
