/**
 * Runs the CLI the way a published user gets it: both packages packed, both
 * tarballs installed into an empty project, then `build`, `export` and `dev`.
 * Inside the workspace the CLI is a symlink Node resolves to the source
 * package, so nothing this asserts can be seen by any layer that runs there.
 *
 * It claims three things and no more. Whether a build emits its 404 copy, or an
 * export renders the configured template, is the same question inside the
 * workspace and outside it, so those belong to the layers that run on every
 * change (docs/adr/0021). What only this can see is that an installed package
 * resolves, starts, and produces something.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const FIXTURE_PDF = path.join(repoRoot, 'scripts/fixture/slides.pdf');

const PACKAGES = [
  path.join(repoRoot, 'packages/client'),
  path.join(repoRoot, 'packages/note-first-presenter'),
];

/** Runs a command and, when it fails, says what it printed rather than only that it failed. */
function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed in ${cwd}\n${stdout ?? ''}${stderr ?? ''}`,
    );
  }
}

function step(message: string): void {
  console.log(`\n> ${message}`);
}

/**
 * Polls `probe` until it yields a value, at `interval`, failing at `deadline`
 * with the last reason the probe gave for not having one yet.
 */
async function waitFor<T>(
  probe: () => Promise<{ value: T } | { reason: string }>,
  opts: { timeoutMs: number; intervalMs: number; what: string },
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    const result = await probe();
    if ('value' in result) return result.value;
    if (Date.now() > deadline) {
      throw new Error(
        `${opts.what} did not happen within ${opts.timeoutMs}ms (last: ${result.reason})`,
      );
    }
    await delay(opts.intervalMs);
  }
}

/**
 * Packs both packages and returns the tarball paths.
 *
 * `pnpm pack` fires `prepack` and `prepare` but not `prepublishOnly` (measured
 * with a probe package logging all four), so this is safe to call from the very
 * hook that runs this script. `prepack` builds the CLI's dist and `prepare`
 * compiles the client's paraglide output, so both tarballs come out complete
 * without this script knowing either step exists.
 *
 * Nothing here rewrites a manifest the way Slidev's scripts/pack.mjs does. The
 * CLI declares the client in `peerDependencies`, so installing both tarballs
 * satisfies it with no edit to any package.json — and an edit is exactly what a
 * script running from a publish hook must not make, because the working tree it
 * dirties belongs to whoever is publishing (docs/adr/0013, docs/adr/0021).
 */
function packAll(destination: string): string[] {
  return PACKAGES.map((pkg) => {
    const output = run('pnpm', ['pack', '--json', '--pack-destination', destination], pkg);
    // The lifecycle scripts' output lands on stdout ahead of the report, so the
    // JSON starts at the last unindented `{`.
    const report: unknown = JSON.parse(output.slice(output.lastIndexOf('\n{\n') + 1));
    const { filename } = report as { filename?: string };
    assert.ok(filename, `pnpm pack reported no tarball filename for ${pkg}:\n${output}`);
    return filename;
  });
}

/**
 * A port nothing else holds, confirmed by binding it.
 *
 * Picking one and hoping does not work here: Vite silently moves to the next
 * port when the one it was given is taken, and this script would then poll an
 * address nothing is listening on and report the published CLI as broken.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('could not read the bound port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function createProject(work: string, tarballs: string[]): Promise<string> {
  const project = path.join(work, 'project');
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'nfp-verify-fixture', private: true, type: 'module' }, null, 2)}\n`,
  );
  run('pnpm', ['add', ...tarballs], project);

  await fs.copyFile(FIXTURE_PDF, path.join(project, 'slides.pdf'));
  await fs.writeFile(
    path.join(project, '.note-first-presenter.json'),
    JSON.stringify({ version: 1, title: 'Deck', outline: { type: 'doc', content: [] } }),
  );
  return project;
}

async function verifyBuild(bin: string, project: string): Promise<void> {
  run(bin, ['build'], project);
  const shell = await fs.readFile(path.join(project, 'dist/index.html'), 'utf8');
  assert.ok(shell.length > 0, 'build emitted an empty dist/index.html');
  const meta: unknown = JSON.parse(
    await fs.readFile(path.join(project, 'dist/nfp-data/meta.json'), 'utf8'),
  );
  assert.equal(
    (meta as { kind?: string }).kind,
    'resolved',
    `build did not resolve the deck: ${JSON.stringify(meta)}`,
  );
  console.log('  dist/index.html and dist/nfp-data/meta.json look right');
}

async function verifyExport(bin: string, project: string): Promise<void> {
  run(bin, ['export'], project);
  const exported = await fs.readFile(path.join(project, 'export/index.html'), 'utf8');
  assert.ok(exported.length > 0, 'export emitted an empty export/index.html');
  console.log('  export/index.html looks right');
}

/**
 * Starts the installed dev server and asks it the one thing only it can answer.
 *
 * `GET /` would not do: Vite's SPA fallback serves index.html for anything the
 * nfp middleware does not claim, so a plugin that failed to load at all would
 * still answer 200. `/nfp-data/meta.json` comes from that middleware and
 * nothing else, which makes it the smallest proof that the plugin is running
 * from an installed package. `dev` is also the only command whose Vite root —
 * the client package — sits inside node_modules; `build` never creates the
 * cache directory that root implies, so only this reaches that ground.
 */
async function verifyDev(bin: string, project: string): Promise<void> {
  const port = await freePort();
  // `--host 127.0.0.1` rather than the default `localhost`, which can bind ::1
  // only and leave this polling an IPv4 address nothing answers on — a failure
  // that reads exactly like a CLI too broken to serve.
  const server = spawn(bin, ['dev', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: project,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  server.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

  try {
    let body: unknown;
    try {
      body = await waitFor(
        async () => {
          assert.equal(
            server.exitCode,
            null,
            `dev exited with ${server.exitCode} before it served anything:\n${output}`,
          );
          const meta = await fetchMeta(port);
          return meta.ok ? { value: meta.body } : { reason: meta.reason };
        },
        { timeoutMs: 60_000, intervalMs: 250, what: 'dev serving /nfp-data/meta.json' },
      );
    } catch (error) {
      // The assertion above already carries the server output; a timeout does
      // not, and the output is the only clue why the server never came up.
      if (error instanceof assert.AssertionError) throw error;
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
    }
    assert.equal(
      (body as { kind?: string }).kind,
      'resolved',
      `dev served a deck it could not resolve: ${JSON.stringify(body)}`,
    );
    console.log(`  dev served /nfp-data/meta.json on :${port}`);
  } finally {
    await shutdown(server);
  }
}

/** SIGTERM with a grace period, then SIGKILL — no fixed sleep on the happy path. */
async function shutdown(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), delay(2000).then(() => false)]);
  if (!graceful) {
    server.kill('SIGKILL');
    await exited;
  }
}

/**
 * The response body, or the reason there is none yet while the server is still
 * coming up. The reason is carried out rather than swallowed so a timeout can
 * say whether it was connection-refused all along or something else.
 */
async function fetchMeta(
  port: number,
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/nfp-data/meta.json`);
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  // Outside the repository, always. pnpm walks up looking for a workspace, so a
  // project created anywhere under this one would be adopted as a member —
  // `workspace:` would resolve again and the isolation this script exists for
  // would be gone, silently, with everything still passing.
  const work = await fs.mkdtemp(path.join(tmpdir(), 'nfp-verify-'));
  const tarballDir = path.join(work, 'tarballs');
  await fs.mkdir(tarballDir);

  try {
    step('pack');
    const tarballs = packAll(tarballDir);
    for (const tarball of tarballs) console.log(`  ${path.basename(tarball)}`);

    step('install into an empty project');
    const project = await createProject(work, tarballs);
    const bin = path.join(project, 'node_modules/.bin/note-first-presenter');

    step('build');
    await verifyBuild(bin, project);

    step('export');
    await verifyExport(bin, project);

    step('dev');
    await verifyDev(bin, project);

    console.log('\nThe published form resolves, starts and produces output.');
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
