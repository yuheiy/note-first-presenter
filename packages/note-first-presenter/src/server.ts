import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite-plus';
import { findClosestPkgJsonPath } from 'vitefu';
import { loadNfpConfig } from './config/load-config';
import { resolveSlidesPath } from './config/resolve-slides-path';
import { noteFirstPresenterPlugin } from './plugin';

export interface StartServerOptions {
  port: number;
  host: string;
  open: boolean;
}

export async function startServer(opts: StartServerOptions): Promise<void> {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });

  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  const clientRoot = path.dirname(clientPkgJson);

  process.chdir(clientRoot);

  const server = await createServer({
    root: clientRoot,
    configFile: path.join(clientRoot, 'vite.config.ts'),
    server: { port: opts.port, host: opts.host, open: opts.open ? '/' : false },
    plugins: [
      noteFirstPresenterPlugin({
        cwd,
        slidesStatus,
        fullConfig: config,
        mode: 'dev',
      }),
    ],
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
