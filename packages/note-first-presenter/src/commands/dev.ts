import { createServer } from 'vite';
import { createViteConfig } from '../vite';

export interface DevInput {
  clientRoot: string;
  port: number;
  host: string;
  open: boolean;
}

export async function dev({ clientRoot, port, host, open }: DevInput): Promise<void> {
  const server = await createServer({
    ...createViteConfig({ clientRoot, isStatic: false }),
    server: {
      port,
      host,
      open: open ? '/' : false,
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
}
