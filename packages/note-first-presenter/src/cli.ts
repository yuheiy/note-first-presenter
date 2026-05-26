import { defineCommand } from 'citty';

export interface CliArgs {
  port: number;
  host: string;
  open: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 5173, host: 'localhost', open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') {
      args.port = Number(argv[++i]);
    } else if (a === '--host') {
      args.host = argv[++i] ?? 'localhost';
    } else if (a === '--open' || a === '-o') {
      args.open = true;
    }
  }
  return args;
}

export const mainCommand = defineCommand({
  meta: {
    name: 'note-first-presenter',
    version: '0.0.0',
    description: 'Start the presenter dev server',
  },
  args: {
    port: { type: 'string', default: '5173', alias: 'p' },
    host: { type: 'string', default: 'localhost' },
    open: { type: 'boolean', default: false, alias: 'o' },
  },
  async run({ args }) {
    const { startServer } = await import('./server');
    await startServer({
      port: Number(args.port),
      host: args.host,
      open: args.open,
    });
  },
});
