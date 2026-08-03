import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vite-plus/test';
import { DEFAULT_SLIDES_PATH } from '../../slides.ts';
import { freshTempDir } from '../../__tests__/helpers.ts';
import { createSlidesContext } from '../slidesContext.ts';

const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');

const cwd = freshTempDir('nfp-context-');

/** What `resolveSlides` reports for an unconfigured project with no deck on disk. */
const missingDefault = () =>
  ({ kind: 'missing', path: path.join(cwd(), DEFAULT_SLIDES_PATH) }) as const;

describe('createSlidesContext', () => {
  // The resolution rules themselves are slides.test.ts's; this only pins that
  // the context wires config loading and resolveSlides together.
  it('resolves the deck the config names against the given cwd', async () => {
    await fs.mkdir(path.join(cwd(), 'assets'), { recursive: true });
    await fs.copyFile(SAMPLE_PDF, path.join(cwd(), 'assets/deck.pdf'));
    await fs.writeFile(
      path.join(cwd(), 'note-first-presenter.config.ts'),
      'export default { slides: "assets/deck.pdf" };',
    );
    const ctx = await createSlidesContext({ cwd: cwd() });
    try {
      expect(ctx.getSlidesStatus()).toEqual({
        kind: 'resolved',
        path: path.join(cwd(), 'assets/deck.pdf'),
      });
    } finally {
      await ctx.close();
    }
  });

  it('calls onSettle once after initial reload', async () => {
    const onSettle = vi.fn();
    const ctx = await createSlidesContext({ cwd: cwd(), onSettle });
    try {
      expect(onSettle).toHaveBeenCalledTimes(1);
    } finally {
      await ctx.close();
    }
  });

  it('reports a failed reload via onError and degrades to missing', async () => {
    // A config whose default export throws on load makes loadNfpConfig reject.
    await fs.writeFile(
      path.join(cwd(), 'note-first-presenter.config.ts'),
      'throw new Error("boom");',
    );
    const onSettle = vi.fn();
    const onError = vi.fn();
    const ctx = await createSlidesContext({ cwd: cwd(), onSettle, onError });
    try {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onSettle).not.toHaveBeenCalled();
      expect(ctx.getSlidesStatus()).toEqual(missingDefault());
    } finally {
      await ctx.close();
    }
  });

  // One deck lifecycle end to end: the watcher is pointed at a path that does
  // not exist yet, sees it appear, sees its content change, sees it go.
  it('follows the deck appearing, changing and disappearing', { timeout: 30_000 }, async () => {
    const onSettle = vi.fn();
    const ctx = await createSlidesContext({ cwd: cwd(), onSettle });
    try {
      expect(ctx.getSlidesStatus()).toEqual(missingDefault());

      await fs.copyFile(SAMPLE_PDF, path.join(cwd(), 'slides.pdf'));
      await vi.waitFor(
        () => {
          expect(ctx.getSlidesStatus()).toEqual({
            kind: 'resolved',
            path: path.join(cwd(), 'slides.pdf'),
          });
        },
        { timeout: 5000 },
      );

      // Let the appear-cycle's settles drain first, so the growth asserted
      // below can only come from the append.
      await vi.waitFor(
        async () => {
          const before = onSettle.mock.calls.length;
          await new Promise((resolve) => setTimeout(resolve, 300));
          expect(onSettle.mock.calls.length).toBe(before);
        },
        { timeout: 5000 },
      );

      // Written right after settle, inside the window where the dynamic
      // watcher's initial scan may still be running.
      const settled = onSettle.mock.calls.length;
      await fs.appendFile(path.join(cwd(), 'slides.pdf'), ' ');
      await vi.waitFor(
        () => {
          expect(onSettle.mock.calls.length).toBeGreaterThan(settled);
        },
        { timeout: 5000 },
      );

      await fs.rm(path.join(cwd(), 'slides.pdf'));
      await vi.waitFor(
        () => {
          expect(ctx.getSlidesStatus()).toEqual(missingDefault());
        },
        { timeout: 5000 },
      );
    } finally {
      await ctx.close();
    }
  });
});
