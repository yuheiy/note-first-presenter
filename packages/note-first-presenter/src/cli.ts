import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import { findClosestPkgJsonPath } from 'vitefu';
import pkg from '../package.json' with { type: 'json' };
import { loadNfpConfig } from './config';
import { resolveSlides } from './slides';

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

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the presenter dev server' },
  args: sharedServerArgs,
  async run({ args }) {
    const clientRoot = await resolveClientRoot();

    const { dev } = await import('./commands/dev');
    await dev({
      clientRoot,
      port: Number(args.port),
      host: args.host,
      open: args.open,
    });
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Generate a static read-only site' },
  args: { 'out-dir': { type: 'string' } },
  async run({ args }) {
    const { config, filePath } = await loadNfpConfig('build');
    const slidesStatus = await resolveSlides({
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    const outDir = path.resolve(args['out-dir'] ?? config?.build?.outDir ?? 'dist');
    const clientRoot = await resolveClientRoot();

    const { build } = await import('./commands/build');
    await build({ slidesStatus, outDir, clientRoot });
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

    const { exportAsPage } = await import('./commands/export');
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
  // to the default `dev` subcommand. build/export ignore these.
  args: sharedServerArgs,
  subCommands: {
    dev,
    build,
    export: export_,
  },
  default: 'dev',
});

await runMain(main);
