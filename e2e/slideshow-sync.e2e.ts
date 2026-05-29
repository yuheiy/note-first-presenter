import { expect, test } from '@playwright/test';
import { resetDb } from './_helpers.ts';

test('slideshow image src follows presenter active slide via BroadcastChannel', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const presenter = await context.newPage();
  const slideshow = await context.newPage();

  await presenter.goto('/');
  await resetDb(presenter);
  await presenter.reload();
  await slideshow.goto('/slideshow');
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
    .toMatch(/\/2$/);

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
    .toMatch(/\/3$/);

  await context.close();
});

test('slide image endpoint serves a webp image', async ({ page }) => {
  await page.goto('/');
  const meta = await (await page.request.get('/api/slides/meta')).json();
  expect(meta.status).toBe('resolved');
  const res = await page.request.get(`/api/slide/${meta.hash}/1`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/webp');
  const body = await res.body();
  expect(body.byteLength).toBeGreaterThan(0);
});
