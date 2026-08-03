import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vite-plus/test';

/**
 * A fresh temp directory per test, handed to the code under test as an explicit
 * cwd argument — the process cwd is never touched, so tests cannot serialize on
 * it. `realpath` resolves the macOS `/tmp` → `/private/tmp` symlink so paths
 * derived from the returned value compare equal to what the code resolves.
 */
export function freshTempDir(prefix: string): () => string {
  let tmp = '';
  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), prefix)));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });
  return () => tmp;
}
