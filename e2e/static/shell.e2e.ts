import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const DIST = path.resolve(import.meta.dirname, '../fixtures/basic/dist');

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

// The 404.html fallback is read off disk rather than requested. `vite preview`
// falls back to index.html on its own, so no request over this connection ever
// reaches the fallback document — but the file is what a static host serves
// when it cannot rewrite, and in history mode that is what keeps a fresh
// `GET /slideshow` from 404ing on GitHub Pages (docs/adr/0017). The build this
// project depends on has already run, so `dist/` here is this commit's output
// and not the copy that happens to be committed.
test('emits the 404 fallback as a copy of the shell, and no other document', async () => {
  const shell = await fs.readFile(path.join(DIST, 'index.html'), 'utf8');
  expect(await fs.readFile(path.join(DIST, '404.html'), 'utf8')).toBe(shell);
  const entries = await fs.readdir(DIST);
  expect(entries.filter((entry) => entry.endsWith('.html')).sort()).toEqual([
    '404.html',
    'index.html',
  ]);
});

test('emits the slide data next to the shell', async ({ page }) => {
  const meta = await page.request.get('/nfp-data/meta.json');
  expect(meta.ok()).toBe(true);
  expect((await meta.json()).kind).toBe('resolved');
});

// G4's static half: a shared build must not write, and must not look writable.
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
