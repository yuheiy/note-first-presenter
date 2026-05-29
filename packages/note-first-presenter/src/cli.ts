import { defineCommand } from 'citty';

const sharedServerArgs = {
  port: { type: 'string', default: '5173', alias: 'p' },
  host: { type: 'string', default: 'localhost' },
  open: { type: 'boolean', default: false, alias: 'o' },
} as const;

export const mainCommand = defineCommand({
  meta: {
    name: 'note-first-presenter',
    version: '0.0.0',
    description: 'Start the presenter dev server',
  },
  args: sharedServerArgs,
  subCommands: {
    dev: defineCommand({
      meta: { name: 'dev', description: 'Start the presenter dev server' },
      args: sharedServerArgs,
      async run({ args }) {
        const { startServer } = await import('./server');
        await startServer({
          port: Number(args.port),
          host: args.host,
          open: args.open,
        });
      },
    }),
    build: defineCommand({
      meta: { name: 'build', description: 'Generate a static read-only site' },
      args: { 'out-dir': { type: 'string' } },
      async run({ args }) {
        const { runBuild } = await import('./build');
        await runBuild({ outDir: args['out-dir'] });
      },
    }),
    export: defineCommand({
      meta: { name: 'export', description: 'Export the deck via an eta template' },
      args: {
        'out-dir': { type: 'string' },
        'image-dir': { type: 'string' },
        template: { type: 'string' },
      },
      async run({ args }) {
        const { runExport } = await import('./export');
        await runExport({
          outDir: args['out-dir'],
          imageDir: args['image-dir'],
          template: args.template,
        });
      },
    }),
  },
  default: 'dev',
});
