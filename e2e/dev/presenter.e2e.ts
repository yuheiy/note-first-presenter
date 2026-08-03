import { expect, test } from '@playwright/test';
import { focusEditor, resetDb } from '../helpers.ts';

function waitForDbSave(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (res) =>
      res.url().endsWith('/nfp-data/db.json') &&
      res.request().method() === 'PUT' &&
      res.status() === 204,
  );
}

test.beforeEach(async ({ page }) => {
  await resetDb(page);
  const dbSaved = waitForDbSave(page);
  await page.goto('/');
  // The presenter auto-fills an empty title with "Untitled" and persists it on
  // load. Wait for that save to settle before each test so it cannot race with
  // the test's own waitForDbSave (which would otherwise resolve on the
  // auto-fill PUT and let the test reload before its own edit is saved).
  await dbSaved;
});

test('typing into the editor persists across reload', async ({ page }) => {
  await focusEditor(page);
  const saved = waitForDbSave(page);
  await page.keyboard.type('hello world');
  await saved;
  await page.reload();
  await expect(page.getByText('hello world')).toBeVisible();
});

test('--- separators split notes into slide groups', async ({ page }) => {
  // Four groups against a 3-page PDF: the listbox shows
  // max(pdfPageCount, groupCount) rows (the client's computeSlideOverflow), so
  // anything fewer than 4 groups here would be masked by the page count and the
  // assertion could pass with splitting broken entirely.
  const editor = await focusEditor(page);
  await editor.pressSequentially('first');
  for (const text of ['second', 'third', 'fourth']) {
    await page.keyboard.press('Enter');
    await editor.pressSequentially('---');
    await page.keyboard.press('Enter');
    await editor.pressSequentially(text);
  }

  await expect(editor).toContainText('first');
  await expect(editor).toContainText('fourth');

  await expect(page.getByRole('option')).toHaveCount(4);
});

test('title input saves and reloads', async ({ page }) => {
  const title = page.getByRole('textbox', { name: 'Title' });
  // The presenter auto-fills an empty title with the default ("Untitled") on
  // load, so replace the value rather than appending to it.
  const saved = waitForDbSave(page);
  await title.fill('My Talk');
  await saved;
  await page.reload();
  await expect(title).toHaveValue('My Talk');
});
