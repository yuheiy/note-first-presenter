import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';
import { App } from '../App';
import { composeSlideshowHref, type RouterMode } from '../lib/urls';

// The pages are stubbed: the claim under test is *which* page a URL opens, not
// what the page does. Everything between the two is the real shipped
// composition — these behaviours now live in wouter, and this file is where
// the ones this app relies on stay pinned when the dependency moves
// (docs/adr/0017).
vi.mock('../routes/index', () => ({
  default: () => <main>workspace-page</main>,
}));
vi.mock('../routes/slideshow', () => ({
  default: () => <main>slideshow-page</main>,
}));

/** Renders the app at `url` (path + search + hash, origin-relative) without a document load. */
function renderAt(mode: RouterMode, base: string, url: string) {
  history.replaceState(null, '', url);
  return render(<App mode={mode} base={base} />);
}

async function expectPage(screen: ReturnType<typeof render>, page: string) {
  await expect.element((await screen).getByRole('main')).toHaveTextContent(page);
}

describe('routing', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  describe('history mode', () => {
    it('opens the slideshow on its path', async () => {
      await expectPage(renderAt('history', '/', '/slideshow'), 'slideshow-page');
    });

    it('opens the workspace on the base itself', async () => {
      await expectPage(renderAt('history', '/', '/'), 'workspace-page');
    });

    it('tolerates a trailing slash on the route', async () => {
      await expectPage(renderAt('history', '/', '/slideshow/'), 'slideshow-page');
    });

    it('strips the base, trailing slash and all', async () => {
      await expectPage(renderAt('history', '/sub/', '/sub/slideshow'), 'slideshow-page');
    });

    // A pathname outside the base cannot address a page, so it falls to the
    // workspace — same for any typo'd URL arriving through 404.html. There is
    // no route that fails to resolve to a page.
    it('falls back to the workspace for anything unrecognised', async () => {
      await expectPage(renderAt('history', '/sub/', '/elsewhere/slideshow'), 'workspace-page');
    });
  });

  describe('hash mode', () => {
    it('reads the route out of the hash', async () => {
      await expectPage(renderAt('hash', '/', '/#/slideshow'), 'slideshow-page');
    });

    it('opens the workspace on an empty hash', async () => {
      await expectPage(renderAt('hash', '/', '/'), 'workspace-page');
    });

    // The whole point of hash mode: the route is the same however deep the
    // document is served, so the base never enters into it.
    it('ignores the base entirely', async () => {
      await expectPage(
        renderAt('hash', '/deeply/nested/', '/deeply/nested/#/slideshow'),
        'slideshow-page',
      );
    });

    // A URL this app never emits, but one a reader might type. It is *not*
    // accepted: the query stays part of the location wouter matches against,
    // matches nothing, and falls to the workspace. Tolerating it would mean
    // opening the slideshow while silently dropping the slide number.
    it('does not accept a query inside the hash', async () => {
      await expectPage(renderAt('hash', '/', '/#/slideshow?slide=2'), 'workspace-page');
    });
  });

  // The href the toolbar composes has to be a URL the router reads back as the
  // slideshow, or the named window would open on the workspace.
  it('opens the slideshow from a composed href, in both modes', async () => {
    for (const mode of ['hash', 'history'] as const) {
      const screen = renderAt(mode, '/sub/', composeSlideshowHref(mode, '/sub/', 3));
      await expectPage(screen, 'slideshow-page');
      await (await screen).unmount();
    }
  });
});
