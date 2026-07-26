import { test } from '@playwright/test';
import { buildFixture } from '../helpers.ts';

// Setup project for `subpath`. A second output directory rather than a reuse of
// `dist`, so the two static projects cannot race each other's artifact.
test('build the static site for a subdirectory', () => {
  test.setTimeout(180_000);
  buildFixture('--base', '/sub/', '--out-dir', 'dist-sub');
});
