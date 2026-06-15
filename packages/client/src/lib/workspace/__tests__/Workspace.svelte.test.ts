// Workspace requires titleArea/outliner Snippet props, so it is awkward to render
// directly. Render it through Editor, the thinnest production wrapper.

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { m } from '$lib/paraglide/messages';
import type { SlidesMeta } from '$lib/slides-meta/slides-meta-store.svelte';

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

function mockApi(meta: SlidesMeta | Error) {
  apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === '/api/db' && opts?.method === 'PUT') return Promise.resolve();
    if (url === '/api/db')
      return Promise.resolve({ version: 1, title: 'Deck', outline: outlineWith(['note']) });
    if (meta instanceof Error) return Promise.reject(meta);
    return Promise.resolve(meta);
  });
}

describe('Workspace', () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.clear();
  });

  // Step 1: smoke
  it('shows info_no_slides in role="status" when no-config-no-file', async () => {
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect.element(screen.getByRole('status')).toHaveTextContent(m.info_no_slides());
  });

  // Step 2: the four slide-state branches
  it('shows the listbox with one option per page when resolved', async () => {
    mockApi({ kind: 'resolved', hash: 'h1', pageCount: 3 });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const listbox = screen.getByRole('listbox', { name: 'Slides' });
    await expect.element(listbox).toBeInTheDocument();
    const option = screen.getByRole('option');
    await expect.element(option.nth(0)).toBeInTheDocument();
    await expect.element(option.nth(1)).toBeInTheDocument();
    await expect.element(option.nth(2)).toBeInTheDocument();
  });

  it('selecting a slide moves the outliner active group to that slide', async () => {
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/api/db' && opts?.method === 'PUT') return Promise.resolve();
      if (url === '/api/db')
        return Promise.resolve({
          version: 1,
          title: 'Deck',
          outline: outlineWith(['one', '---', 'two', '---', 'three']),
        });
      return Promise.resolve({ kind: 'resolved', hash: 'h1', pageCount: 3 });
    });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    // initially group 1 ("one") is active
    await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-active-slide="true"]')?.textContent).toContain('one');
    });

    // selecting slide 3 moves the outliner active group to "three"
    await screen.getByRole('option').nth(2).click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-active-slide="true"]')?.textContent).toContain('three');
    });
  });

  it('shows error_slides_not_found in role="alert" when configured-but-missing', async () => {
    mockApi({ kind: 'configured-but-missing', configuredPath: '/decks/missing.pdf' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(m.error_slides_not_found({ path: '/decks/missing.pdf' }));
  });

  it('shows error_multiple_pdfs in role="alert" when no-config-multiple-files', async () => {
    mockApi({ kind: 'no-config-multiple-files', candidates: ['a.pdf', 'b.pdf'] });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(m.error_multiple_pdfs({ files: 'a.pdf, b.pdf' }));
  });

  it('shows the error message in role="alert" on a network error', async () => {
    mockApi(new Error('meta down'));
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    // the Outliner stays rendered
    await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
    await expect.element(screen.getByRole('alert')).toHaveTextContent('meta down');
  });

  // Step 3: view-state persistence
  it('clicking the toggle closes the list and writes false to localStorage', async () => {
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const toggleBtn = screen.getByRole('button', { name: m.toggle_slide_list() });

    // initial state: open
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect.element(screen.getByRole('status')).toBeInTheDocument();

    // click to close
    await toggleBtn.click();
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await vi.waitFor(() => {
      expect(localStorage.getItem('nfp:listOpen')).toBe('false');
    });
    // the list pane content disappears
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument();

    // click again to restore
    await toggleBtn.click();
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect.element(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with the list closed when nfp:listOpen=false is stored', async () => {
    localStorage.setItem('nfp:listOpen', 'false');
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const toggleBtn = screen.getByRole('button', { name: m.toggle_slide_list() });
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('checking the "Dark" radio writes nfp:theme=dark to localStorage', async () => {
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const darkRadio = screen.getByRole('radio', { name: m.theme_dark() });
    await darkRadio.click();
    await vi.waitFor(() => {
      expect(localStorage.getItem('nfp:theme')).toBe('dark');
    });
  });
});
