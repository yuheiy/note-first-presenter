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

function mockPublishedDb(db: { title: string; outline: unknown }) {
  apiMock.mockImplementation((url: string) => {
    if (url === '/nfp-data/db.json') return Promise.resolve({ version: 1, ...db });
    return Promise.resolve({ kind: 'no-config-no-file' });
  });
}

describe('Viewer', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('loads the published db.json and renders the outline read-only', async () => {
    mockPublishedDb({ title: 'My Deck', outline: outlineWith(['hello note']) });
    const { default: Viewer } = await import('../Viewer.svelte');
    const screen = render(Viewer);

    await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Deck');
    const outliner = screen.getByRole('textbox', { name: 'Outliner' });
    await expect.element(outliner).toHaveAttribute('contenteditable', 'false');
    await expect.element(outliner).toHaveTextContent('hello note');
    expect(apiMock).toHaveBeenCalledWith('/nfp-data/db.json');
  });

  it('falls back to the default title when the published title is empty', async () => {
    mockPublishedDb({ title: '', outline: outlineWith(['a']) });
    const { default: Viewer } = await import('../Viewer.svelte');
    const screen = render(Viewer);

    await expect
      .element(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent(m.title_default());
  });

  it('surfaces an error when the published db fails to load', async () => {
    apiMock.mockImplementation((url: string) => {
      if (url === '/nfp-data/db.json') return Promise.reject(new Error('network down'));
      return Promise.resolve({ kind: 'no-config-no-file' });
    });
    const { default: Viewer } = await import('../Viewer.svelte');
    const screen = render(Viewer);

    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.load_error());
  });

  it('never writes to the db', async () => {
    mockPublishedDb({ title: 'My Deck', outline: outlineWith(['a']) });
    const { default: Viewer } = await import('../Viewer.svelte');
    const screen = render(Viewer);

    await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
    for (const call of apiMock.mock.calls) {
      const opts = call[1] as { method?: string } | undefined;
      expect(opts?.method ?? 'GET').toBe('GET');
    }
  });
});
