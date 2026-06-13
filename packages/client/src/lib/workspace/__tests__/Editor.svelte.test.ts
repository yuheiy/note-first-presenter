import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { m } from '$lib/paraglide/messages';

const apiMock = vi.fn();
vi.mock('$lib/server-client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

// Capture the live-reload handler so tests can simulate the CLI's
// `nfp:slides-changed` push without a real HMR WebSocket.
const liveReload = vi.hoisted(() => {
  let handler: (() => void) | null = null;
  return {
    fire: () => handler?.(),
    onSlidesChanged: (h: () => void) => {
      handler = h;
      return () => {
        handler = null;
      };
    },
  };
});
vi.mock('$lib/slides-meta/live-reload', () => ({
  SLIDES_CHANGED_EVENT: 'nfp:slides-changed',
  onSlidesChanged: liveReload.onSlidesChanged,
}));

function outlineWith(texts: string[]) {
  return {
    type: 'doc',
    content: [
      {
        type: 'bullet_list',
        content: texts.map((text) => ({
          type: 'list_item',
          attrs: { collapsed: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      },
    ],
  };
}

function mockLiveDb(db: { title: string; outline: unknown }) {
  apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === '/api/db' && opts?.method === 'PUT') return Promise.resolve();
    if (url === '/api/db') return Promise.resolve({ version: 1, ...db });
    return Promise.resolve({ kind: 'no-config-no-file' });
  });
}

describe('Editor', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('loads the db from the live API and renders an editable outline', async () => {
    mockLiveDb({ title: 'Deck', outline: outlineWith(['hello note']) });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const title = screen.getByRole('textbox', { name: m.title_label() });
    await expect.element(title).toHaveValue('Deck');
    await expect.element(title).not.toHaveAttribute('readonly');
    const outliner = screen.getByRole('textbox', { name: 'Outliner' });
    await expect.element(outliner).toHaveAttribute('contenteditable', 'true');
    expect(apiMock).toHaveBeenCalledWith('/api/db');
  });

  it('surfaces an error when the initial db load fails', async () => {
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/api/db' && opts?.method === 'PUT') return Promise.resolve();
      if (url === '/api/db') return Promise.reject(new Error('server gone'));
      return Promise.resolve({ kind: 'no-config-no-file' });
    });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.load_error());
  });

  it('persists title edits through the live API after the debounce window', async () => {
    mockLiveDb({ title: 'Deck', outline: outlineWith(['a']) });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const title = screen.getByRole('textbox', { name: m.title_label() });
    await expect.element(title).toHaveValue('Deck');
    await title.fill('Renamed');

    await vi.waitFor(
      () => {
        expect(apiMock).toHaveBeenCalledWith(
          '/api/db',
          expect.objectContaining({
            method: 'PUT',
            body: expect.objectContaining({ title: 'Renamed' }),
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('refreshes slides in place on a slides-changed push, preserving the outline', async () => {
    let metaResponse: unknown = { kind: 'resolved', hash: 'h1', pageCount: 1 };
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/api/db' && opts?.method === 'PUT') return Promise.resolve();
      if (url === '/api/db')
        return Promise.resolve({ version: 1, title: 'Deck', outline: outlineWith(['hello note']) });
      return Promise.resolve(metaResponse);
    });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    // Initial slide rendered from the first hash, outline editing context present.
    await expect
      .element(screen.getByRole('img', { name: 'Slide 1' }))
      .toHaveAttribute('src', expect.stringContaining('h1'));
    const outliner = screen.getByRole('textbox', { name: 'Outliner' });
    await expect.element(outliner).toHaveTextContent('hello note');

    // PDF changes on disk: the CLI pushes, and the meta endpoint now reports a
    // new hash and an extra page.
    metaResponse = { kind: 'resolved', hash: 'h2', pageCount: 2 };
    liveReload.fire();

    // Slides update in place (new hash, grown count) without a full reload.
    await expect
      .element(screen.getByRole('img', { name: 'Slide 1' }))
      .toHaveAttribute('src', expect.stringContaining('h2'));
    await expect
      .element(screen.getByRole('img', { name: 'Slide 2' }))
      .toHaveAttribute('src', expect.stringContaining('h2'));

    // The outline editing context survives the partial update.
    await expect.element(outliner).toHaveTextContent('hello note');
  });
});
