import { expect, test } from '@playwright/test';

// The static tree is where the hash router and the unified /nfp-data/* URLs are
// most likely to break, because nothing serves them dynamically — whatever the
// build emitted is all there is. See plans/react-rewrite-spec.md §8.7.
//
// Each page gets its own document on purpose: the hash is read once at startup
// and there is no hashchange listener, so navigating by hash alone inside one
// document would never switch pages (§1.2).

test('serves the workspace off the emitted index.html', async ({ page }) => {
  await page.goto('/');
  // A bare `/` normalises to the first slide before the page renders.
  await expect(page).toHaveURL(/#\/1$/);
  await expect(page.getByText('Workspace')).toBeVisible();
});

test('serves the slideshow off the same index.html', async ({ page }) => {
  await page.goto('/#/slideshow/1');
  await expect(page.getByText('Slideshow')).toBeVisible();
});

test('emits the slide data next to the shell', async ({ page }) => {
  const meta = await page.request.get('/nfp-data/meta.json');
  expect(meta.ok()).toBe(true);
  expect((await meta.json()).kind).toBe('resolved');
});
