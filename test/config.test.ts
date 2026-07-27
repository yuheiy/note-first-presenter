import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

const SAMPLE_PDF = path.resolve(import.meta.dirname, 'fixtures/sample.pdf');

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function projectWith(configBody: string): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-config-int-'));
  await fs.copyFile(SAMPLE_PDF, path.join(tmp, 'slides.pdf'));
  await fs.writeFile(path.join(tmp, 'note-first-presenter.config.ts'), configBody);
  return tmp;
}

// Short on purpose. The point of these tests is that the bin gives up *on its
// own*, so anything still alive at this deadline has already failed the test —
// see KILLED below for why that needs saying out loud.
const GIVE_UP_MS = 20_000;

/**
 * Runs the source bin and reports how it died. Expects it to die.
 *
 * `status` alone is not enough to assert on. A process killed at the deadline
 * exits 143 (128 + SIGTERM), so `status > 0` holds just as well for a `dev`
 * server that came up and ran happily forever — which is exactly the bug these
 * tests exist to catch. `killed` is what separates "refused" from "outlived us".
 */
function runExpectingFailure(
  cwd: string,
  args: string[],
): { status: number; killed: boolean; stderr: string } {
  try {
    execFileSync('note-first-presenter', args, { cwd, stdio: 'pipe', timeout: GIVE_UP_MS });
  } catch (err) {
    const e = err as { status?: number; code?: string; stderr?: Buffer };
    return {
      status: e.status ?? -1,
      killed: e.code === 'ETIMEDOUT',
      stderr: e.stderr?.toString() ?? '',
    };
  }
  throw new Error(`expected \`${args.join(' ')}\` to fail, but it exited 0`);
}

// Both commands read the config before doing anything else, and a config they
// cannot make sense of stops them. `dev` earns its own case: it only started
// reading the config when routerMode/base arrived (docs/adr/0017), and before
// that a malformed config merely degraded the plugin's slide resolution while
// the server came up regardless. Failing at startup is the decision; the
// watcher's tolerance for a config edited *while* dev runs is separate and
// deliberate (vite/plugin.ts).
describe('note-first-presenter config validation (bin integration)', () => {
  it('refuses to build with an unknown routerMode', async () => {
    const cwd = await projectWith(`export default { routerMode: 'bogus' };\n`);
    const { status, killed, stderr } = runExpectingFailure(cwd, ['build']);
    expect(killed).toBe(false);
    expect(status).toBe(1);
    // Naming the accepted values is the difference between a usable error and a
    // stack trace, so it is part of the contract rather than incidental.
    expect(stderr).toContain('hash');
    expect(stderr).toContain('history');
  }, 60_000);

  it('refuses to start dev with an unknown routerMode', async () => {
    const cwd = await projectWith(`export default { routerMode: 'bogus' };\n`);
    const { status, killed } = runExpectingFailure(cwd, ['dev']);
    // `killed` first: without the fail-fast in cli.ts the server comes up and
    // serves the deck with a silently-defaulted routerMode, and the only symptom
    // is that it is still running here. Asserting the exit code alone passes in
    // that world (143 from the kill), which is how this test was wrong once.
    expect(killed).toBe(false);
    expect(status).toBe(1);
  }, 60_000);

  it('refuses an unknown config key rather than ignoring it', async () => {
    const cwd = await projectWith(`export default { routreMode: 'hash' };\n`);
    const { status, killed } = runExpectingFailure(cwd, ['build']);
    expect(killed).toBe(false);
    expect(status).toBe(1);
  }, 60_000);

  // Caught as a bad *setting* rather than left to fail as a bad file: without
  // the schema check this reaches pdfjs, which fails with a parse error naming
  // nothing the author can act on (docs/adr/0019).
  it('refuses a slides path whose extension nothing can render', async () => {
    const cwd = await projectWith(`export default { slides: 'deck.key' };\n`);
    const { status, killed, stderr } = runExpectingFailure(cwd, ['build']);
    expect(killed).toBe(false);
    expect(status).toBe(1);
    expect(stderr).toContain('.pdf');
  }, 60_000);
});
