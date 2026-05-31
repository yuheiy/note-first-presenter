import { createServer as createViteServer, type ViteDevServer } from 'vite';
import type { SlidesStatus } from '../slides';
import { createViteConfig } from '../vite';

export interface CreateServerInput {
  cwd?: string;
  slidesStatus: SlidesStatus;
  clientRoot: string;
  port: number;
  host: string;
  open: boolean;
}

export async function createServer({
  cwd,
  slidesStatus,
  clientRoot,
  port,
  host,
  open,
}: CreateServerInput): Promise<ViteDevServer> {
  return await createViteServer({
    ...createViteConfig({
      cwd,
      slidesStatus,
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
