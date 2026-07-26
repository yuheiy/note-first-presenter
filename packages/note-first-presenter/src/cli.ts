import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import { findClosestPkgJsonPath } from 'vitefu';
import pkg from '../package.json' with { type: 'json' };
import {
  DEFAULT_ROUTER_MODE,
  loadNfpConfig,
  ROUTER_MODES,
  type NoteFirstPresenterConfig,
  type RouterMode,
} from './config.ts';
import { resolveSlides } from './slides.ts';

async function resolveClientRoot(): Promise<string> {
  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  return path.dirname(clientPkgJson);
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

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the presenter dev server' },
  args: { ...sharedServerArgs, ...sharedRouteArgs },
  async run({ args }) {
    // dev did not read the config file before: the plugin resolves slides on its
    // own. routerMode/base are the first settings the server itself needs.
    const { config } = await loadNfpConfig('dev');
    const clientRoot = await resolveClientRoot();

    const { dev } = await import('./commands/dev.ts');
    await dev({
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
    const { config, filePath } = await loadNfpConfig('build');
    const slidesStatus = await resolveSlides({
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    const outDir = path.resolve(args['out-dir'] ?? config?.build?.outDir ?? 'dist');
    const clientRoot = await resolveClientRoot();

    const { build } = await import('./commands/build.ts');
    await build({
      slidesStatus,
      outDir,
      clientRoot,
      ...resolveRouteOptions(args, config),
    });
  },
});

const export_ = defineCommand({
  meta: { name: 'export', description: 'Export the deck via an eta template' },
  args: {
    'out-dir': { type: 'string' },
    'assets-dir': { type: 'string' },
  },
  async run({ args }) {
    const { config, filePath } = await loadNfpConfig('build');
    const slidesStatus = await resolveSlides({
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    if (slidesStatus.kind !== 'resolved') {
      throw new Error(`slides not available: ${slidesStatus.kind}`);
    }
    const exportCfg = config?.export;
    const filename = exportCfg?.filename ?? 'index.html';
    const template = exportCfg?.template ?? null;
    const outDir = path.resolve(args['out-dir'] ?? exportCfg?.outDir ?? 'export');
    const assetsDir = path.resolve(outDir, args['assets-dir'] ?? exportCfg?.assetsDir ?? 'assets');
    const assetsRelDir = path.relative(outDir, assetsDir).split(path.sep).join('/') || '.';

    const { exportAsPage } = await import('./commands/export.ts');
    await exportAsPage({
      slidesStatus,
      outDir,
      assetsDir,
      assetsRelDir,
      template,
      filename,
    });
  },
});

const main = defineCommand({
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
    export: export_,
  },
  default: 'dev',
});

await runMain(main);
