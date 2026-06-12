import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { m } from '$lib/paraglide/messages';

const apiMock = vi.fn();
vi.mock('$lib/server-client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
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
});
