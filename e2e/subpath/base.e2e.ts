import { expect, test } from '@playwright/test';

/**
 * The only place `--base` is exercised end to end, and the reason it is a
 * project of its own (docs/adr/0017).
 *
 * Four independent layers have to agree on the base before a subdirectory deploy
 * works, and none of them can be checked without actually serving one:
 *
 *   1. Vite's own asset rewriting (`/sub/assets/…` in the emitted index.html)
 *   2. `resolveRoutePath()`, which slices the base off the pathname
 *   3. `dataUrl()`, which prepends it verbatim
 *   4. the slideshow href, which has to start from it
 *
 * Every URL here is relative on purpose: Playwright resolves it against a
 * baseURL that already ends in `/sub/`, and a leading slash would throw that
 * away — which is exactly the bug class this file exists to catch.
 */

test('serves the workspace from under the base path', async ({ page }) => {
  await page.goto('');
  await expect(page).toHaveURL(/\/sub\/$/);
  await expect(page.getByRole('textbox', { name: 'Outliner' })).toBeVisible();
  // Layer 3: the slide list only renders rows once meta.json has been fetched
  // from `/sub/nfp-data/`, so a base-less dataUrl would leave this empty.
  await expect(page.getByRole('listbox', { name: 'Slides' })).toBeVisible();
  await expect(page.getByRole('option').first()).toBeVisible();
  // Layer 4, off the same page load: the workspace's one real link — a fresh
  // document load into a named window, so its href has to be right on its own.
  await expect(page.getByRole('link', { name: 'Play slideshow' })).toHaveAttribute(
    'href',
    '/sub/slideshow',
  );
});

test('routes the slideshow under the base path', async ({ page }) => {
  // Layer 2. Get the base's trailing slash wrong and the route reads as
  // `slideshow` instead of `/slideshow`, falling through to the workspace.
  await page.goto('slideshow');
  await expect(page.getByRole('img', { name: 'Slide 1' })).toBeVisible();
});

test('addresses slide images under the base path', async ({ page }) => {
  await page.goto('slideshow?slide=2');
  const image = page.getByRole('img', { name: 'Slide 2' });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^\/sub\/nfp-data\/slides\//);
});
