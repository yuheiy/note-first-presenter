import { expect, type Locator, test } from '@playwright/test';
import { focusEditor, resetDb } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await resetDb(page);
  await page.goto('/');
});

/**
 * Synthesizes a modified click on the Nth top-level list item's bullet area
 * (the `<li>` outside of the inner `<p>`). The `item-multi-select` plugin's
 * `handleDOMEvents.mousedown` treats an event whose `target` is the `<li>`
 * itself as a bullet click. In a real browser this happens when the user
 * clicks the `li::marker` pseudo-element, but the marker is not directly
 * hittable via Playwright's coordinate-based `click()` (clicks tend to land
 * on the inner `<p>`). Synthesizing the DOM event with the `<li>` as the
 * target keeps the e2e focused on observable behavior (range decoration,
 * keymap response) rather than DOM hit testing.
 *
 * Plain (unmodified) bullet clicks are a no-op in production; only
 * Shift / Cmd / Ctrl clicks act on the item, so this helper requires a
 * modifier.
 */
async function clickBullet(locator: Locator, mod: { shift?: boolean; meta?: boolean }) {
  await locator.evaluate(
    (li, { shift, meta }) => {
      const rect = (li as HTMLElement).getBoundingClientRect();
      const init: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        shiftKey: shift,
        metaKey: meta,
        ctrlKey: meta,
        clientX: rect.left + 4,
        clientY: rect.top + rect.height / 2,
      };
      (li as HTMLElement).dispatchEvent(new MouseEvent('mousedown', init));
      (li as HTMLElement).dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    },
    { shift: mod.shift ?? false, meta: mod.meta ?? false },
  );
}

test('Shift+Click on a bullet extends a NodeRangeSelection from the anchor item', async ({
  page,
}) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('three');

  // Cmd+Click anchors a single-item NodeRangeSelection on the first li so
  // the subsequent Shift+Click has a defined anchor.
  await clickBullet(page.locator('.outliner-root li').nth(0), { meta: true });
  await clickBullet(page.locator('.outliner-root li').nth(2), { shift: true });

  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(3);
});

test('Mod+Shift+ArrowDown moves a NodeRangeSelection past the next sibling', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('d');

  await clickBullet(page.locator('.outliner-root li').nth(0), { meta: true });
  await page.keyboard.press('Shift+ArrowDown');
  // Sanity: the range now covers two items.
  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(2);

  // Outliner.svelte registers the move keymap as Mod-Shift-ArrowDown on macOS
  // and Alt-Shift-ArrowDown elsewhere, detecting platform via the browser's
  // userAgent (Bowser). Mirror that source of truth here — Playwright's
  // Desktop Chrome device ships a Windows UA regardless of the host OS, so
  // matching against the runner's `process.platform` would miss the keymap.
  const isMac = await page.evaluate(() => /Mac/i.test(navigator.userAgent));
  await page.keyboard.press(isMac ? 'Meta+Shift+ArrowDown' : 'Alt+Shift+ArrowDown');

  const texts = await page.locator('.outliner-root li > p').allTextContents();
  expect(texts).toEqual(['c', 'a', 'b', 'd']);
});
