import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { freshTempDir } from '../../__tests__/helpers.ts';

// Mocked so the assertion below can be about what did *not* happen. Without it
// a bad config would still fail the test, but for the wrong reason — the real
// dev() would try to bind a port and reach for the client package, and a failure
// there proves nothing about ordering.
vi.mock('../dev.ts', () => ({ dev: vi.fn() }));

const { dev: devImpl } = await import('../dev.ts');
const { dev } = await import('../index.ts');

const tmp = freshTempDir('nfp-cli-');

// The command layer is the one place `process.cwd()` is read — everything under
// it takes the cwd as an argument — so driving a command means actually running
// from the project directory, the way a user does.
let originalCwd = '';
beforeEach(() => {
  originalCwd = process.cwd();
  process.chdir(tmp());
});
afterEach(() => {
  process.chdir(originalCwd);
});

/**
 * The one property that only the order of statements can carry.
 *
 * `dev` reads the config before it imports and calls the server, so a config it
 * cannot understand exits 1 instead of starting. Move the read after the call
 * and nothing throws: the server comes up and serves the deck with a silently
 * defaulted routerMode, and the only symptom is that it is still running. The
 * integration layer used to catch this by launching the bin and asserting the
 * process was not killed at a deadline — asserting the exit code alone passed in
 * the broken world, since a killed process exits 143. That layer is gone
 * (docs/adr/0021), and no pure function under here would notice, because the
 * fact is about which statement runs first.
 */
describe('dev command', () => {
  it('refuses a config it cannot understand before starting the server', async () => {
    await fs.writeFile(
      path.join(tmp(), 'note-first-presenter.config.ts'),
      `export default { routerMode: 'bogus' };`,
    );

    await expect(
      dev.run?.({ args: { port: '5173', host: 'localhost', open: false } } as never),
    ).rejects.toThrow();

    expect(devImpl).not.toHaveBeenCalled();
  });
});
