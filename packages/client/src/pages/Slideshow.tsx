/**
 * Slideshow page (`/#/slideshow/<slide>`) — the full-bleed slide view opened in
 * a second window and driven over BroadcastChannel.
 *
 * Its own document, always: the workspace opens it with `target="nfp-slideshow"`
 * and there is no way back, which is why the two pages share no state and no
 * cache (plans/react-rewrite-spec.md §1.2).
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { useActiveSlide } from '../lib/routes';
import { computeSlideOverflow, stepSlide } from '../components/slides/overflow';
import { SlideImage } from '../components/slides/SlideImage';
import { describeSlidesMeta, useSlidesMeta } from '../components/slides/slidesMeta';
import { useSyncSubscriber } from '../components/slides/sync';
import { useReadOnlyDb } from '../components/workspace/db';
import { m } from '../lib/paraglide/messages.js';

export default function Slideshow() {
  const meta = useSlidesMeta();
  // Only for the window's title, and read-only in the literal sense: the
  // slideshow has nothing to save, in either mode. §3.3's ownership diagram
  // gives this page only meta/activeSlide/subscribe, so this fetch is a
  // deliberate addition to it — dropping it would leave the slideshow window
  // nameless, and main.tsx already warms the request for both pages (§1.3).
  const db = useReadOnlyDb();
  const [activeSlide, setActiveSlide] = useActiveSlide();
  const [syncedSlideCount, setSyncedSlideCount] = useState(0);

  // Receive-only. The workspace never listens, so nothing done here travels back
  // (§3.3).
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

  const resolved = meta.data?.kind === 'resolved' ? meta.data : null;
  // The count on the wire already accounts for note groups past the PDF's last
  // page, so this window can be asked to navigate further than its own meta
  // reports.
  const overflow = computeSlideOverflow(resolved?.pageCount ?? 0, syncedSlideCount);

  // The presentation's own title, verbatim — not the workspace's "Presenter: …",
  // because this window is the presentation. Left alone until the document
  // lands, so the tab keeps index.html's title until there is something truer to
  // say.
  const title = db.status === 'ready' ? db.data.title : null;
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);

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
  // though the deck resolved (§5.7). Everything else is the sentence the
  // workspace's slide panel would have shown, minus the tone — a black field has
  // nothing to say a hint apart from an error with.
  const fallbackMessage =
    resolved && overflowing
      ? m.slide_beyond_pdf_pages_label({ n: activeSlide })
      : (describeSlidesMeta(meta.data, meta.error)?.message ?? null);

  return (
    // Click anywhere to advance, the way a slide remote's single button behaves.
    // The keyboard path is the window listener above, not this element.
    <div
      className="h-svh bg-black"
      onClick={() => {
        step(1);
      }}
    >
      {resolved && !overflowing ? (
        <SlideImage hash={resolved.hash} slide={activeSlide} />
      ) : (
        fallbackMessage !== null && (
          // The former SlideshowFallback, inlined: one caller (§5.7).
          <div className="grid h-full place-items-center p-8 text-center font-sans text-[1.25rem] text-white">
            {fallbackMessage}
          </div>
        )
      )}
    </div>
  );
}
