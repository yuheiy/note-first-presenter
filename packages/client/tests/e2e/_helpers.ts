import type { Page } from '@playwright/test';

export async function resetDb(page: Page) {
  await page.request.put('/api/db', {
    data: { version: 1, title: '', outline: { type: 'doc', content: [] } },
  });
}

export async function focusEditor(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Outliner' });
  await editor.click();
  return editor;
}
