import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createViteConfig, type CommandContext } from './shared';

export interface CreateServerInput extends CommandContext {
  port: number;
  host: string;
  open: boolean;
}

export async function createServer(input: CreateServerInput): Promise<ViteDevServer> {
  return await createViteServer({
    ...createViteConfig({
      cwd: input.cwd,
      slidesStatus: input.slidesStatus,
      fullConfig: input.fullConfig,
      mode: 'dev',
      clientRoot: input.clientRoot,
      isStatic: false,
    }),
    server: {
      port: input.port,
      host: input.host,
      open: input.open ? '/' : false,
    },
  });
}
