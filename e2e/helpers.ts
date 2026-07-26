import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from '@playwright/test';

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/basic');

/**
 * Refreshes an artifact one of the static preview servers is serving.
 *
 * Shared so the two setup projects differ only by the argv that distinguishes
 * them, rather than by a second copy of the fixture path and the stdio contract.
 */
export function buildFixture(...args: string[]) {
  execFileSync('note-first-presenter', ['build', ...args], { cwd: FIXTURE, stdio: 'pipe' });
}

export async function resetDb(page: Page) {
  await page.request.put('/nfp-data/db.json', {
    data: { version: 1, title: '', outline: { type: 'doc', content: [] } },
  });
}

export async function focusEditor(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Outliner' });
  await editor.click();
  return editor;
}
