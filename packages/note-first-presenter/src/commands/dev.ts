import { createServer } from 'vite';
import type { RouterMode } from '../config.ts';
import { createViteConfig } from '../vite/index.ts';

export interface DevInput {
  clientRoot: string;
  port: number;
  host: string;
  open: boolean;
  routerMode?: RouterMode;
  base?: string;
}

export async function dev({
  clientRoot,
  port,
  host,
  open,
  routerMode,
  base,
}: DevInput): Promise<void> {
  const projectCwd = process.cwd();
  process.chdir(clientRoot);

  const server = await createServer({
    ...createViteConfig({ clientRoot, projectCwd, routerMode, base }),
    server: {
      port,
      host,
      // `true` rather than '/': Vite then opens its own base URL, so `--base
      // /sub/` opens /sub/ instead of the origin root.
      open,
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
