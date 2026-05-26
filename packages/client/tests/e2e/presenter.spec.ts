import { expect, test } from '@playwright/test';
import { focusEditor, resetDb } from './_helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetDb(page);
  await page.reload();
});

async function waitForDbSave(page: import('@playwright/test').Page) {
  await page.waitForResponse(
    (res) =>
      res.url().endsWith('/api/db') && res.request().method() === 'PUT' && res.status() === 204,
  );
}

test('renders presenter shell with slide list', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Outliner' })).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Slides' })).toBeVisible();
  await expect(page.getByRole('option').nth(0)).toBeVisible();
});

test('typing into the editor persists across reload', async ({ page }) => {
  await focusEditor(page);
  const saved = waitForDbSave(page);
  await page.keyboard.type('hello world');
  await saved;
  await page.reload();
  await expect(page.getByText('hello world')).toBeVisible();
});

test('--- separator splits notes into two slide groups', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('first');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('---');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('second');

  await expect(editor).toContainText('first');
  await expect(editor).toContainText('second');

  // PDF has 3 pages and groups = 2, so listbox stays at max(3, 2) = 3
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('title input saves and reloads', async ({ page }) => {
  const title = page.getByRole('textbox', { name: 'Untitled' });
  await title.click();
  const saved = waitForDbSave(page);
  await title.pressSequentially('My Talk');
  await saved;
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Untitled' })).toHaveValue('My Talk');
});
