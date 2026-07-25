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
  await expect(page.getByRole('textbox', { name: 'Outliner' })).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Slides' })).toBeVisible();
});

test('serves the slideshow off the same index.html', async ({ page }) => {
  await page.goto('/#/slideshow/1');
  await expect(page.getByRole('img', { name: 'Slide 1' })).toBeVisible();
});

test('emits the slide data next to the shell', async ({ page }) => {
  const meta = await page.request.get('/nfp-data/meta.json');
  expect(meta.ok()).toBe(true);
  expect((await meta.json()).kind).toBe('resolved');
});

// G4's static half: a shared build must not write, and must not look writable.
//
// It replaces the integration suite's old "no /api/ string in the bundle"
// marker, which went hollow when §2.2 gave both modes the same URLs — GET and
// PUT now share `/nfp-data/db.json`, so no string can tell a read from a write.
//
// Be precise about what this does and does not establish. It checks the
// behaviour — nothing writes, nothing is editable — which no amount of
// minification or refactoring can fake. It does *not* check that the Editor was
// dead-code-eliminated: `import.meta.env.DEV` is false at runtime in a built
// site too, so pages/Workspace.tsx would render the Viewer, and this test would
// pass, even with the whole Editor still sitting in the bundle. §8.8 accepts
// that gap on purpose — "DCE 自体は G1〜G4 に含まれない", its only cost being
// bundle weight. Confirming elimination means reading the emitted chunks.
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
  // from the outside (§4.6). Asserted second so the write check above is what
  // names the failure when an Editor is what shipped.
  await expect(outliner).not.toContainText('should not be typed');
});
