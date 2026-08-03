import { describe, expect, it } from 'vite-plus/test';
import { freshTempDir } from '../../__tests__/helpers.ts';
import { ViteNfpPlugin } from '../plugin.ts';

const cwd = freshTempDir('nfp-plugin-');

/**
 * Enough of a ViteDevServer for `configureServer`, plus a way to shut the
 * watchers down again — the plugin only exposes that through httpServer's
 * 'close' event, so the fake has to capture the listener.
 */
function createFakeServer(base: string) {
  const mounted: { route: unknown; handle: unknown }[] = [];
  let closeListener: (() => void) | undefined;
  const server = {
    middlewares: {
      use: (route: unknown, handle?: unknown) => {
        mounted.push({ route, handle });
      },
    },
    config: { base, logger: { error: () => {} } },
    ws: { send: () => {} },
    httpServer: {
      on: (event: string, cb: () => void) => {
        if (event === 'close') closeListener = cb;
      },
    },
  };
  return { server, mounted, close: () => closeListener?.() };
}

// The middleware is installed from configureServer, which Vite runs *before* it
// adds baseMiddleware — so under `--base /sub/` the URL still carries the base,
// and an unmounted handler matching a bare `/nfp-data/` would fall through to
// the SPA fallback and answer JSON requests with index.html. Moving the install
// to a post hook does not fix that either: Vite registers htmlFallbackMiddleware
// ahead of the post hooks. Mounting at the base is what makes connect strip the
// prefix, so the handler can stay base-unaware (docs/adr/0017). At the default
// base, connect drops the trailing slash and the mount becomes a no-op.
describe('ViteNfpPlugin', () => {
  it.each(['/sub/', '/'])('mounts the nfp-data middleware at base %s', async (base) => {
    const { server, mounted, close } = createFakeServer(base);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake, see above
    await (ViteNfpPlugin({ cwd: cwd() }).configureServer as any)(server);
    try {
      expect(mounted).toHaveLength(1);
      expect(mounted[0]!.route).toBe(base);
      expect(typeof mounted[0]!.handle).toBe('function');
    } finally {
      close();
    }
  });
});
