import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test } from '@playwright/test';

const FIXTURE = path.resolve(import.meta.dirname, '../fixtures/basic');

// Setup project for `static`: refreshes the artifact the 4173 preview server
// serves. Kept out of a global setup so `--project=dev` never pays for it.
test('build the static site', () => {
  test.setTimeout(180_000);
  execFileSync('note-first-presenter', ['build'], { cwd: FIXTURE, stdio: 'pipe' });
});
