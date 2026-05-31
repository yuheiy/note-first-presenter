import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createViteConfig, type CommandContext } from './shared';

export interface CreateServerInput extends CommandContext {
  port: number;
  host: string;
  open: boolean;
}

export async function createServer({
  cwd,
  slidesStatus,
  fullConfig,
  clientRoot,
  port,
  host,
  open,
}: CreateServerInput): Promise<ViteDevServer> {
  return await createViteServer({
    ...createViteConfig({
      cwd,
      slidesStatus,
      fullConfig,
      clientRoot,
      isStatic: false,
    }),
    server: {
      port,
      host,
      open: open ? '/' : false,
    },
  });
}
