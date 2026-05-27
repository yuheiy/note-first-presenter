import { expect, type Locator, type Page, test } from '@playwright/test';
import { focusEditor, resetDb } from './_helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetDb(page);
  await page.reload();
});

/**
 * Simulates a bullet click on the Nth top-level list item.
 *
 * Production code (`bullet-drag`/`bullet-click` plugins) treats a click whose
 * `event.target` is the `<li>` itself (i.e. outside the inner `<p>`) as a
 * bullet click. In a real browser this happens when the user clicks the
 * `li::marker` pseudo-element, but the marker is not directly hittable via
 * Playwright's coordinate-based `click()` (clicks tend to land on the inner
 * `<p>`). Instead we synthesize the mousedown DOM event with the `<li>` as
 * the target — the path the plugin's `handleDOMEvents.mousedown` is designed
 * to handle. This keeps the e2e test focused on observable behavior
 * (selection decoration, keymap response) rather than DOM hit testing, which
 * is already covered by unit tests for `resolveBulletClickSelection`.
 */
async function clickBullet(locator: Locator, opts: { shift?: boolean } = {}) {
  await locator.evaluate((li, shift) => {
    const rect = (li as HTMLElement).getBoundingClientRect();
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      shiftKey: shift,
      clientX: rect.left + 4,
      clientY: rect.top + rect.height / 2,
    };
    (li as HTMLElement).dispatchEvent(new MouseEvent('mousedown', init));
    (li as HTMLElement).dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  }, opts.shift ?? false);
}

/**
 * Simulates a bullet drag from `from` to `to`. The bullet-drag plugin is
 * driven by a mousedown on the bullet, followed by `mousemove`/`mouseup`
 * dispatched on the window. Using real `page.mouse` interactions does not
 * trigger the plugin because the initial click lands on the inner `<p>`
 * (see `clickBullet` for context).
 */
async function dragBullet(page: Page, from: Locator, to: Locator) {
  await from.evaluate((li) => {
    const rect = (li as HTMLElement).getBoundingClientRect();
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + 4,
      clientY: rect.top + rect.height / 2,
    };
    (li as HTMLElement).dispatchEvent(new MouseEvent('mousedown', init));
  });
  const toBox = await to.boundingBox();
  if (!toBox) throw new Error('layout missing');
  // Drive the drag via window-level events; the plugin listens on window for
  // `mousemove` / `mouseup`.
  await page.evaluate(
    ({ x, y }) => {
      const init: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      };
      window.dispatchEvent(new MouseEvent('mousemove', init));
      window.dispatchEvent(new MouseEvent('mousemove', init));
      window.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    },
    { x: toBox.x + 4, y: toBox.y + toBox.height * 0.9 },
  );
}

test('Shift+Click on a bullet extends NodeSelection to NodeRangeSelection', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('three');

  // Click first bullet
  await clickBullet(page.locator('.outliner-root li').nth(0));
  // Shift+Click third bullet
  await clickBullet(page.locator('.outliner-root li').nth(2), { shift: true });

  // All three li should be highlighted
  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(3);
});

test('Shift+ArrowDown extends NodeRangeSelection from a NodeSelection', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');

  await clickBullet(page.locator('.outliner-root li').nth(0));
  await page.keyboard.press('Shift+ArrowDown');

  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(2);
});

test('Backspace on a NodeRangeSelection deletes the entire range', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('three');

  await clickBullet(page.locator('.outliner-root li').nth(0));
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Backspace');

  await expect(page.locator('.outliner-root li')).toHaveCount(1);
  await expect(page.locator('.outliner-root li').first()).toContainText('three');
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

  await clickBullet(page.locator('.outliner-root li').nth(0));
  await page.keyboard.press('Shift+ArrowDown');
  // Sanity: the range was extended to two items.
  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(2);

  // Use Alt-Shift on Linux/Windows CI runners (Outliner.svelte mirrors this).
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+Shift+ArrowDown' : 'Alt+Shift+ArrowDown');

  const texts = await page.locator('.outliner-root li > p').allTextContents();
  expect(texts).toEqual(['c', 'a', 'b', 'd']);
});

test('Tab indents a NodeRangeSelection under the previous sibling', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');

  await clickBullet(page.locator('.outliner-root li').nth(1));
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Tab');

  // After indent: a > [b, c] — top-level li becomes 1
  await expect(page.locator('.outliner-root > .ProseMirror > ul > li')).toHaveCount(1);
  await expect(page.locator('.outliner-root > .ProseMirror > ul > li > ul > li')).toHaveCount(2);
});

test('Dragging the bullet moves the item to a new position', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');

  const firstLi = page.locator('.outliner-root li').nth(0);
  const lastLi = page.locator('.outliner-root li').nth(2);
  await dragBullet(page, firstLi, lastLi);

  const texts = await page.locator('.outliner-root li > p').allTextContents();
  expect(texts).toEqual(['b', 'c', 'a']);
});
