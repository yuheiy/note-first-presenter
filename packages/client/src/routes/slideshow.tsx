/**
 * Slideshow page (`/slideshow`, or `#/slideshow` in hash mode) — the full-bleed
 * slide view opened in a second window and driven over BroadcastChannel.
 *
 * Its own document, always: the workspace opens it with `target="nfp-slideshow"`
 * and there is no way back, which is why the two pages share no state and no
 * cache.
 */
import { useAtom, useAtomValue } from 'jotai';
import { Suspense, useEffect, useEffectEvent, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { activeSlideAtom } from '../components/slides/activeSlide';
import { computeSlideOverflow, stepSlide } from '../components/slides/overflow';
import { SlideImage } from '../components/slides/SlideImage';
import { describeSlidesMeta, slidesMetaAtom } from '../components/slides/slidesMeta';
import { useSyncSubscriber } from '../components/slides/sync';
import { reason } from '../components/ErrorOverlay';
import { useStoredDocument } from '../components/workspace/useDb';
import { m } from '../lib/paraglide/messages.js';

/**
 * The page, which is only the black field and the boundaries around it.
 *
 * The stage below reads the metadata, so it can wait and it can fail; neither
 * may reach the field itself, or a slideshow whose deck did not resolve would be
 * a blank document rather than a black screen with a sentence on it.
 */
export default function Slideshow() {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div className="h-svh bg-black">
          <SlideshowMessage message={reason(error)} />
        </div>
      )}
    >
      <Suspense fallback={<div className="h-svh bg-black" />}>
        <SlideStage />
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * The one sentence a slideshow with nothing to show has to offer.
 *
 * The black field is the caller's, not this component's: the stage already draws
 * one and takes the click that advances the deck, while the boundary's fallback
 * needs a field of its own.
 */
function SlideshowMessage({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center font-sans text-[1.25rem] text-white">
      {message}
    </div>
  );
}

function SlideStage() {
  const meta = useAtomValue(slidesMetaAtom);
  const [activeSlide, setActiveSlide] = useAtom(activeSlideAtom);
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
  // though the deck resolved. Everything else is the same sentence the
  // workspace's slide panel would have shown.
  const fallbackMessage =
    resolved && overflowing
      ? m.slide_beyond_pdf_pages_label({ n: activeSlide })
      : describeSlidesMeta(meta);

  return (
    // Click anywhere to advance, the way a slide remote's single button behaves.
    // The keyboard path is the window listener above, not this element. A plain
    // onClick, not RAC's Pressable: Pressable demands tabIndex plus a role, and
    // with those `usePress` also fires on Space — double-advancing with the
    // window's Space handler. No role and no tabIndex is what guarantees this
    // div stays out of the tab order and off Space (docs/adr/0015).
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
        fallbackMessage !== null && <SlideshowMessage message={fallbackMessage} />
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
  const { title } = useStoredDocument();
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
