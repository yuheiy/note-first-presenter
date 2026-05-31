import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { defineCommand, runMain } from 'citty';
import { build as viteBuild, createServer } from 'vite';
import pkg from '../package.json' with { type: 'json' };
import { resolveClientRoot } from './commands/shared';
import { loadNfpConfig, resolveBuildOptions, resolveExportOptions } from './config';
import { cacheRootFor, resolveSlidesPath } from './slides';
import { writeBuildData } from './node/pipeline/build-data';
import { runPipelineExport } from './node/pipeline/export';
import { createViteConfig } from './vite/config';

const sharedServerArgs = {
  port: { type: 'string', default: '5173', alias: 'p' },
  host: { type: 'string', default: 'localhost' },
  open: { type: 'boolean', default: false, alias: 'o' },
} as const;

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the presenter dev server' },
  args: sharedServerArgs,
  async run({ args }) {
    const cwd = process.cwd();
    const { config, filePath } = await loadNfpConfig(cwd);
    const slidesStatus = await resolveSlidesPath({
      cwd,
      configuredSlides: config?.slides,
      configFile: filePath,
    });

    const clientRoot = await resolveClientRoot();
    process.chdir(clientRoot);

    const server = await createServer({
      ...createViteConfig({
        cwd,
        slidesStatus,
        fullConfig: config,
        mode: 'dev',
        clientRoot,
        isStatic: false,
      }),
      server: {
        port: Number(args.port),
        host: args.host,
        open: args.open ? '/' : false,
      },
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
    const cwd = process.cwd();
    const { config, filePath } = await loadNfpConfig(cwd);
    const slidesStatus = await resolveSlidesPath({
      cwd,
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    const { outDir } = resolveBuildOptions({
      cwd,
      config,
      flags: { outDir: args['out-dir'] },
    });

    const clientRoot = await resolveClientRoot();
    process.chdir(clientRoot);

    await viteBuild(
      createViteConfig({
        cwd,
        slidesStatus,
        fullConfig: config,
        mode: 'build',
        clientRoot,
        isStatic: true,
        outDir,
      }),
    );

    await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '200.html'));

    await writeBuildData({
      outDir,
      dbPath: path.join(cwd, '.note-first-presenter.json'),
      cacheRoot: cacheRootFor(cwd),
      slidesStatus,
    });

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
    const cwd = process.cwd();
    const { config, filePath } = await loadNfpConfig(cwd);
    const slidesStatus = await resolveSlidesPath({
      cwd,
      configuredSlides: config?.slides,
      configFile: filePath,
    });
    if (slidesStatus.kind !== 'resolved') {
      throw new Error(`slides not available: ${slidesStatus.kind}`);
    }
    const opts = resolveExportOptions({
      cwd,
      config,
      flags: {
        outDir: args['out-dir'],
        imageDir: args['image-dir'],
        template: args.template,
      },
    });
    const name = path.basename(slidesStatus.path, path.extname(slidesStatus.path)) || 'notes';

    const outFile = await runPipelineExport({
      slidesPath: slidesStatus.path,
      dbPath: path.join(cwd, '.note-first-presenter.json'),
      cacheRoot: cacheRootFor(cwd),
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
