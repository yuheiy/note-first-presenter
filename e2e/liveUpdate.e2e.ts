import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { focusEditor, resetDb } from './helpers.ts';

// The dev server watches this PDF (auto-detected as the sole *.pdf in the
// fixture cwd). Mutating it on disk is what exercises the chokidar -> HMR ws ->
// client partial-update path end to end.
const pdfPath = fileURLToPath(new URL('./fixtures/basic/slides.pdf', import.meta.url));

type ReloadProbe = Window & { __nfpReloaded?: boolean };

test.describe('live partial update', () => {
  let original: Buffer;

  test.beforeEach(async ({ page }) => {
    original = await readFile(pdfPath);
    await resetDb(page);
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Slide 1' })).toBeVisible();
  });

  test.afterEach(async () => {
    // Restore the committed bytes so the shared fixture is clean for other specs.
    await writeFile(pdfPath, original);
  });

  test('refreshes slides in place without reloading when the PDF changes', async ({ page }) => {
    const slide = page.getByRole('img', { name: 'Slide 1' });
    const initialSrc = await slide.getAttribute('src');

    // Unsaved keystrokes in the outline: a full reload would discard them.
    const editor = await focusEditor(page);
    await page.keyboard.type('unsaved note');
    await expect(editor).toContainText('unsaved note');

    // Sentinel to detect whether the document context survived (a full reload
    // would wipe this property).
    await page.evaluate(() => {
      (window as ReloadProbe).__nfpReloaded = false;
    });

    // Re-export the PDF: append a trailing comment so the content hash changes
    // while the PDF stays valid with the same pages.
    await writeFile(pdfPath, Buffer.concat([original, Buffer.from('\n% live-update test\n')]));

    // The hash-keyed slide URL updates in place.
    await expect.poll(() => slide.getAttribute('src'), { timeout: 10000 }).not.toBe(initialSrc);

    // No full reload happened: the sentinel and the unsaved keystrokes survive.
    expect(await page.evaluate(() => (window as ReloadProbe).__nfpReloaded)).toBe(false);
    await expect(editor).toContainText('unsaved note');
  });
});
