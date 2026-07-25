import { expect, test } from '@playwright/test';
import { resetDb } from './helpers.ts';

test('slideshow image src follows presenter active slide via BroadcastChannel', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const presenter = await context.newPage();
  const slideshow = await context.newPage();

  await resetDb(presenter);
  await presenter.goto('/');
  // The slideshow's own document, addressed by hash. The workspace opens it with
  // this exact URL; here it is opened directly so the two pages can be driven
  // independently.
  await slideshow.goto('/#/slideshow/1');
  await slideshow.waitForLoadState('networkidle');

  const presenterOptions = presenter.getByRole('option');
  await expect(presenterOptions).toHaveCount(3);

  // Click slide 2 in presenter
  await presenterOptions.nth(1).click();

  // Slideshow image src should update to slide 2 path
  await expect
    .poll(
      async () => {
        const src = await slideshow.locator('img').first().getAttribute('src');
        return src ?? '';
      },
      { timeout: 5000 },
    )
    .toMatch(/\/0002\.webp$/);

  // Click slide 3
  await presenterOptions.nth(2).click();
  await expect
    .poll(
      async () => {
        const src = await slideshow.locator('img').first().getAttribute('src');
        return src ?? '';
      },
      { timeout: 5000 },
    )
    .toMatch(/\/0003\.webp$/);

  await context.close();
});

test('slide image endpoint serves a webp image', async ({ page }) => {
  await page.goto('/');
  let meta: any;
  await expect
    .poll(
      async () => {
        const res = await page.request.get('/nfp-data/meta.json');
        if (!res.ok()) return null;
        meta = await res.json();
        return meta.kind;
      },
      { timeout: 10_000 },
    )
    .toBe('resolved');
  const res = await page.request.get(`/nfp-data/slides/${meta.hash}/0001.webp`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/webp');
  const body = await res.body();
  expect(body.byteLength).toBeGreaterThan(0);
});
