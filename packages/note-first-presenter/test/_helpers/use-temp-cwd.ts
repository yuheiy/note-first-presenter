import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

/**
 * Sets up an isolated temp directory and chdirs to it for each test.
 * Cleans up on afterEach. Wraps `mkdtemp` in `realpath` to resolve the
 * macOS `/tmp` → `/private/tmp` symlink so chdir'd `process.cwd()`
 * matches the returned path.
 */
export function useTempCwd(prefix: string): void {
  let originalCwd = '';
  let tmp = '';
  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), prefix)));
    originalCwd = process.cwd();
    process.chdir(tmp);
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmp, { recursive: true, force: true });
  });
}
