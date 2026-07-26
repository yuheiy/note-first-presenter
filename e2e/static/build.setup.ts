import { test } from '@playwright/test';
import { buildFixture } from '../helpers.ts';

// Setup project for `static`: refreshes the artifact the 4173 preview server
// serves. Kept out of a global setup so `--project=dev` never pays for it.
test('build the static site', () => {
  test.setTimeout(180_000);
  buildFixture();
});
