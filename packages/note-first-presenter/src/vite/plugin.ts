import type { Plugin, ViteDevServer } from 'vite';
import { createNfpDataMiddleware } from './nfpDataMiddleware.ts';
import { createSlidesContext } from './slidesContext.ts';

/** `cwd` is the user's project directory — the deck, config and db live there,
 * not under Vite's `root`, which is the client package. */
export const ViteNfpPlugin = (opts: { cwd: string }): Plugin => ({
  name: 'note-first-presenter',
  apply: 'serve',
  async configureServer(server: ViteDevServer) {
    const { cwd } = opts;
    const { getSlidesStatus, getSlides, close } = await createSlidesContext({
      cwd,
      // Push a partial-update signal instead of a full reload so the Editor
      // can re-fetch slide metadata in place, preserving the outline editing
      // state. The client re-fetches by refreshing its metadata atom inside a
      // React transition (components/slides/slidesMeta.ts). See ADR-0008.
      onSettle: () => server.ws.send({ type: 'custom', event: 'nfp:slides-changed' }),
      onError: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        server.config.logger.error(`[note-first-presenter] reload failed: ${error.message}`, {
          error,
        });
        server.ws.send({
          type: 'error',
          err: { message: error.message, stack: error.stack ?? '' },
        });
      },
    });
    // Installed here rather than from a returned post hook: Vite registers
    // htmlFallbackMiddleware *before* it runs the post hooks, so a post hook
    // would sit behind the SPA fallback and never see /nfp-data/* at all.
    //
    // The cost of being that early is that Vite's own baseMiddleware has not run
    // yet, so `req.url` still carries the base. Mounting at it is connect's
    // answer to that: it strips the prefix (matching on pathname and at a
    // segment boundary, so `/subterranean/…` cannot slip through), restores the
    // URL if the handler calls next(), and — since it drops a trailing slash
    // from the mount point — collapses the default base to no mount at all.
    server.middlewares.use(
      server.config.base,
      createNfpDataMiddleware({ cwd, getSlidesStatus, getSlides }),
    );
    server.httpServer?.on('close', () => {
      close().catch((err) => server.config.logger.error(String(err)));
    });
  },
});
