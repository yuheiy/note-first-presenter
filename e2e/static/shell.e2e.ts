import { expect, test } from '@playwright/test';

// The static tree is where the router and the unified /nfp-data/* URLs are most
// likely to break, because nothing serves them dynamically — whatever the build
// emitted is all there is. See docs/adr/0005 (2026-07-26 addendum, (c)).

test('serves the workspace off the emitted index.html', async ({ page }) => {
  await page.goto('/');
  // The first slide carries no `?slide=`, so `/` is already the canonical URL
  // and nothing rewrites it (docs/adr/0017).
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('textbox', { name: 'Outliner' })).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Slides' })).toBeVisible();
});

test('serves the slideshow off the same index.html', async ({ page }) => {
  await page.goto('/slideshow');
  await expect(page.getByRole('img', { name: 'Slide 1' })).toBeVisible();
});

// The 404.html fallback is asserted one layer down, in test/build.test.ts:
// emitting it is a `copyFile` in the CLI's build command, and nothing here could
// add to that — `vite preview` falls back to index.html on its own, so no
// request over this connection ever reaches the fallback document.

test('emits the slide data next to the shell', async ({ page }) => {
  const meta = await page.request.get('/nfp-data/meta.json');
  expect(meta.ok()).toBe(true);
  expect((await meta.json()).kind).toBe('resolved');
});

// G4's static half: a shared build must not write, and must not look writable.
//
// It replaces the integration suite's old "no /api/ string in the bundle"
// marker, which went hollow once both modes were given the same URLs — GET and
// PUT now share `/nfp-data/db.json`, so no string can tell a read from a write.
//
// Be precise about what this does and does not establish. It checks the
// behaviour — nothing writes, nothing is editable — which no amount of
// minification or refactoring can fake. It does *not* check that the Editor was
// dead-code-eliminated: `import.meta.env.DEV` is false at runtime in a built
// site too, so pages/Workspace.tsx would render the Viewer, and this test would
// pass, even with the whole Editor still sitting in the bundle. That gap is
// accepted on purpose: dead-code elimination is not one of the guarantees this
// suite makes, its only cost being bundle weight. Confirming elimination means
// reading the emitted chunks.
test('never writes: the built site issues no non-GET request', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/');
  const outliner = page.getByRole('textbox', { name: 'Outliner' });
  await expect(outliner).toBeVisible();

  // Typing is the loudest way to ask for a save.
  await outliner.click();
  await page.keyboard.type('should not be typed');

  // Comfortably past the save pipeline's 500ms debounce (SAVE_DEBOUNCE_MS in
  // components/workspace/db.ts), so a shipped Editor would have had every chance
  // to speak up. Not importable from here: the client publishes only ./dbSchema.
  await page.waitForTimeout(1500);
  expect(writes).toEqual([]);

  // And nothing was typed either: ProseMirror never reaches its keydown handlers
  // while `editable` is false, which is the Viewer's read-only guarantee seen
  // from the outside. Asserted second so the write check above is what
  // names the failure when an Editor is what shipped.
  await expect(outliner).not.toContainText('should not be typed');
});
