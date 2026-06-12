// Workspace は titleArea/outliner という Snippet props を要求するため直接 render しづらい。
// そのため、最薄の本番ラッパである Editor を経由して描画する。

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

  // Step 1: スモーク
  it('no-config-no-file のとき role="status" に info_no_slides を表示する', async () => {
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect.element(screen.getByRole('status')).toHaveTextContent(m.info_no_slides());
  });

  // Step 2: スライド状態の 4 分岐
  it('resolved のとき listbox が表示され option が pageCount 件ある', async () => {
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

  it('configured-but-missing のとき role="alert" に error_slides_not_found を表示する', async () => {
    mockApi({ kind: 'configured-but-missing', configuredPath: '/decks/missing.pdf' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(m.error_slides_not_found({ path: '/decks/missing.pdf' }));
  });

  it('no-config-multiple-files のとき role="alert" に error_multiple_pdfs を表示する', async () => {
    mockApi({ kind: 'no-config-multiple-files', candidates: ['a.pdf', 'b.pdf'] });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(m.error_multiple_pdfs({ files: 'a.pdf, b.pdf' }));
  });

  it('通信エラーのとき role="alert" にエラーメッセージを表示する', async () => {
    mockApi(new Error('meta down'));
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    // Outliner が表示され続けることを確認する
    await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
    await expect.element(screen.getByRole('alert')).toHaveTextContent('meta down');
  });

  // Step 3: 表示状態の永続化
  it('開閉ボタンをクリックすると一覧が閉じ localStorage に false が書き込まれる', async () => {
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const toggleBtn = screen.getByRole('button', { name: m.toggle_slide_list() });

    // 初期状態: 開いている
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect.element(screen.getByRole('status')).toBeInTheDocument();

    // クリックして閉じる
    await toggleBtn.click();
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await vi.waitFor(() => {
      expect(localStorage.getItem('nfp:listOpen')).toBe('false');
    });
    // 一覧ペインの中身が消える
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument();

    // 再クリックで復帰
    await toggleBtn.click();
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect.element(screen.getByRole('status')).toBeInTheDocument();
  });

  it('localStorage に nfp:listOpen=false が保存されていると一覧が閉じた状態で描画される', async () => {
    localStorage.setItem('nfp:listOpen', 'false');
    mockApi({ kind: 'no-config-no-file' });
    const { default: Editor } = await import('../Editor.svelte');
    const screen = render(Editor);

    const toggleBtn = screen.getByRole('button', { name: m.toggle_slide_list() });
    await expect.element(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('"Dark" ラジオをチェックすると localStorage に nfp:theme=dark が書き込まれる', async () => {
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
