import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand } from 'citty';
import pkg from '../../package.json' with { type: 'json' };
import {
  DEFAULT_ROUTER_MODE,
  loadNfpConfig,
  ROUTER_MODES,
  type NoteFirstPresenterConfig,
  type RouterMode,
} from '../config.ts';
import { resolveSlides } from '../slides.ts';

// The command tree, separated from the `runMain` call in cli.ts so that
// importing it does not start a CLI. Nothing here is public API — the split
// exists because one property is worth a test and cannot be reached any other
// way: that a config which cannot be understood stops `dev` *before* the server
// comes up. That is a fact about the order of two statements, so no pure
// function extracted from underneath them could carry it (docs/adr/0021).
//
// `process.cwd()` is read here, once per command, and handed down as an
// explicit argument. Nothing below this layer reads the cwd on its own, and
// nothing anywhere calls `process.chdir`.

function resolveClientRoot(): string {
  // The client package exports `./package.json`, so this resolves in one step;
  // the package root is that file's directory.
  return path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
}

const sharedServerArgs = {
  port: { type: 'string', default: '5173', alias: 'p' },
  host: { type: 'string', default: 'localhost' },
  open: { type: 'boolean', default: false, alias: 'o' },
} as const;

// Both reach dev and build alike — the mode because the slideshow's fallback
// dependency has to be walkable before a build, the base because a CI line like
// `--base /${{ github.event.repository.name }}/` cannot live in a config file.
// The config file may set either; the flag wins, matching `--out-dir`.
const sharedRouteArgs = {
  'router-mode': {
    type: 'string',
    description: `where the route lives in the URL: ${ROUTER_MODES.join(' | ')} (default: ${DEFAULT_ROUTER_MODE}). "hash" for hosts that cannot rewrite unknown paths`,
  },
  base: { type: 'string', description: 'public base path for a subdirectory deploy, e.g. /talk/' },
} as const;

/** Both settings, with the flag beating the config file — the `--out-dir` rule. */
function resolveRouteOptions(
  args: { 'router-mode'?: string; base?: string },
  config: NoteFirstPresenterConfig | null,
): { routerMode: RouterMode | undefined; base: string | undefined } {
  const flag = args['router-mode'];
  if (flag !== undefined && !(ROUTER_MODES as readonly string[]).includes(flag)) {
    // Not deferred to the config schema's picklist: this one can name the flag
    // that carried the bad value, which a valibot type error cannot.
    throw new Error(`--router-mode must be one of ${ROUTER_MODES.join(', ')} (got "${flag}")`);
  }
  return {
    routerMode: (flag as RouterMode | undefined) ?? config?.routerMode,
    base: args.base ?? config?.base,
  };
}

export const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the presenter dev server' },
  args: { ...sharedServerArgs, ...sharedRouteArgs },
  async run({ args }) {
    const cwd = process.cwd();
    // This line has to stay ahead of the import below. A config that throws here
    // is how `dev` refuses to start, and the symptom of losing that is not an
    // error — it is a server that comes up and serves the deck with a silently
    // defaulted routerMode. cliCommands.test.ts holds the order in place.
    const { config } = await loadNfpConfig(cwd, 'dev');
    const clientRoot = resolveClientRoot();

    const { dev } = await import('./dev.ts');
    await dev({
      cwd,
      clientRoot,
      port: Number(args.port),
      host: args.host,
      open: args.open,
      ...resolveRouteOptions(args, config),
    });
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Generate a static read-only site' },
  args: { 'out-dir': { type: 'string' }, ...sharedRouteArgs },
  async run({ args }) {
    const cwd = process.cwd();
    const { config } = await loadNfpConfig(cwd, 'build');
    const slidesStatus = resolveSlides(cwd, config?.slides);
    const outDir = path.resolve(cwd, args['out-dir'] ?? config?.build?.outDir ?? 'dist');
    const clientRoot = resolveClientRoot();

    const { build } = await import('./build.ts');
    await build({
      cwd,
      slidesStatus,
      outDir,
      clientRoot,
      ...resolveRouteOptions(args, config),
    });
  },
});

const exportCommand = defineCommand({
  meta: { name: 'export', description: 'Export the deck via an eta template' },
  args: {
    'out-dir': { type: 'string' },
    'assets-dir': { type: 'string' },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { config } = await loadNfpConfig(cwd, 'build');
    const slidesStatus = resolveSlides(cwd, config?.slides);
    const exportCfg = config?.export;
    const filename = exportCfg?.filename ?? 'index.html';
    const template = exportCfg?.template ?? null;
    const outDir = path.resolve(cwd, args['out-dir'] ?? exportCfg?.outDir ?? 'export');
    const assetsDir = path.resolve(outDir, args['assets-dir'] ?? exportCfg?.assetsDir ?? 'assets');
    // How the page will address its images: the assets directory as a URL-style
    // path relative to the page's own directory ('.' when they coincide).
    const assetsRelDir = path.relative(outDir, assetsDir).split(path.sep).join('/') || '.';

    const { exportAsPage } = await import('./export.ts');
    await exportAsPage({
      cwd,
      slidesStatus,
      outDir,
      assetsDir,
      assetsRelDir,
      template,
      filename,
    });
  },
});

export const main = defineCommand({
  meta: {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
  },
  // Lets citty route the bare invocation's value flags (e.g. `--port 4000`)
  // to the default `dev` subcommand. build/export ignore the server half.
  args: { ...sharedServerArgs, ...sharedRouteArgs },
  subCommands: {
    dev,
    build,
    export: exportCommand,
  },
  default: 'dev',
});
