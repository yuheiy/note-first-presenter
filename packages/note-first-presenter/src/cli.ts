import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import { findClosestPkgJsonPath } from 'vitefu';
import pkg from '../package.json' with { type: 'json' };
import { loadConfigAndSlides, resolveBuildOptions, resolveExportOptions } from './config';

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
    const { config, slidesStatus } = await loadConfigAndSlides();

    const clientRoot = await resolveClientRoot();

    const { createServer } = await import('./commands/dev');
    const server = await createServer({
      slidesStatus,
      fullConfig: config,
      clientRoot,
      port: Number(args.port),
      host: args.host,
      open: args.open,
    });

    await server.listen();
    server.printUrls();

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Generate a static read-only site' },
  args: { 'out-dir': { type: 'string' } },
  async run({ args }) {
    const { config, slidesStatus } = await loadConfigAndSlides();
    const { outDir } = resolveBuildOptions({
      config,
      flags: { outDir: args['out-dir'] },
    });

    const clientRoot = await resolveClientRoot();

    const { build } = await import('./commands/build');
    await build({ slidesStatus, fullConfig: config, clientRoot, outDir });

    console.log(`Built static site to ${outDir}`);
  },
});

const export_ = defineCommand({
  meta: { name: 'export', description: 'Export the deck via an eta template' },
  args: {
    'out-dir': { type: 'string' },
    'image-dir': { type: 'string' },
    template: { type: 'string' },
  },
  async run({ args }) {
    const { config, slidesStatus } = await loadConfigAndSlides();
    if (slidesStatus.kind !== 'resolved') {
      throw new Error(`slides not available: ${slidesStatus.kind}`);
    }
    const opts = resolveExportOptions({
      config,
      flags: {
        outDir: args['out-dir'],
        imageDir: args['image-dir'],
        template: args.template,
      },
    });
    const name = path.basename(slidesStatus.path, path.extname(slidesStatus.path)) || 'notes';

    const { exportPage } = await import('./commands/export');
    const outFile = await exportPage({
      slidesStatus,
      outDir: opts.outDir,
      imageDir: opts.imageDir,
      imageRelDir: opts.imageRelDir,
      templatePath: opts.templatePath,
      extension: opts.extension,
      name,
    });
    console.log(`Exported to ${outFile}`);
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
