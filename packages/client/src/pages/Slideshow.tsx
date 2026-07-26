/**
 * Slideshow page (`/slideshow`, or `#/slideshow` in hash mode) — the full-bleed
 * slide view opened in a second window and driven over BroadcastChannel.
 *
 * Its own document, always: the workspace opens it with `target="nfp-slideshow"`
 * and there is no way back, which is why the two pages share no state and no
 * cache.
 */
import { useAtomValue } from 'jotai';
import { Suspense, useEffect, useEffectEvent, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useActiveSlide } from '../lib/routes';
import { computeSlideOverflow, stepSlide } from '../components/slides/overflow';
import { SlideImage } from '../components/slides/SlideImage';
import { describeSlidesMeta, slidesMetaAtom } from '../components/slides/slidesMeta';
import { useSyncSubscriber } from '../components/slides/sync';
import { storedDbAtom, titleAtom } from '../components/workspace/db';
import { m } from '../lib/paraglide/messages.js';

export default function Slideshow() {
  const meta = useAtomValue(slidesMetaAtom);
  const [activeSlide, setActiveSlide] = useActiveSlide();
  const [syncedSlideCount, setSyncedSlideCount] = useState(0);

  // Receive-only. The workspace never listens, so nothing done here travels back.
  useSyncSubscriber((message) => {
    switch (message.type) {
      case 'active-slide':
        setActiveSlide(message.slide);
        break;
      case 'slide-count':
        setSyncedSlideCount(message.count);
        break;
    }
  });

  const resolved = meta.kind === 'resolved' ? meta : null;
  // The count on the wire already accounts for note groups past the PDF's last
  // page, so this window can be asked to navigate further than its own meta
  // reports.
  const overflow = computeSlideOverflow(resolved?.pageCount ?? 0, syncedSlideCount);

  function step(delta: number) {
    // No guard against setting the slide it is already on: React drops a state
    // update to the same value, so the clamp at either end is already a no-op.
    setActiveSlide(stepSlide(overflow, activeSlide, delta));
  }

  // Every key that could mean "next" or "previous" is bound, matching how a
  // remote presenter's forward button reports itself. On window rather than a
  // focusable element: there is nothing here to focus.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
        step(1);
        break;
      case ' ':
        step(event.shiftKey ? -1 : 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        step(-1);
        break;
      case 'Home':
        setActiveSlide(1);
        break;
      case 'End':
        // Nothing to jump to before the deck's length is known.
        if (overflow.slideCount) setActiveSlide(overflow.slideCount);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);

  const overflowing = activeSlide >= overflow.overflowStart;
  // Overflow is decided here rather than in `describeSlidesMeta`: it depends on
  // which slide is showing, which is this page's business, and it applies even
  // though the deck resolved. Everything else is the sentence the
  // workspace's slide panel would have shown, minus the tone — a black field has
  // nothing to say a hint apart from an error with.
  const fallbackMessage =
    resolved && overflowing
      ? m.slide_beyond_pdf_pages_label({ n: activeSlide })
      : (describeSlidesMeta(meta)?.message ?? null);

  return (
    // Click anywhere to advance, the way a slide remote's single button behaves.
    // The keyboard path is the window listener above, not this element.
    <div
      className="h-svh bg-black"
      onClick={() => {
        step(1);
      }}
    >
      {/* Its own boundaries, not the entry's. The title is the one thing on this
          page that needs the stored document, and the slides must neither wait
          on it nor fail with it: db.json carries the whole outline and is the
          heavier of the two requests. */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <WindowTitle />
        </Suspense>
      </ErrorBoundary>
      {resolved && !overflowing ? (
        <SlideImage hash={resolved.hash} slide={activeSlide} />
      ) : (
        fallbackMessage !== null && (
          // The former SlideshowFallback, inlined: one caller.
          <div className="grid h-full place-items-center p-8 text-center font-sans text-[1.25rem] text-white">
            {fallbackMessage}
          </div>
        )
      )}
    </div>
  );
}

/**
 * Names the window after the presentation. Draws nothing.
 *
 * The title is used verbatim — not the workspace's "Presenter: …" — because this
 * window *is* the presentation. It waits on the stored document rather than the
 * working one: this page never edits, and there is no second writer to follow.
 */
function WindowTitle() {
  useAtomValue(storedDbAtom);
  const title = useAtomValue(titleAtom);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
