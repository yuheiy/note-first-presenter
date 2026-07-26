import clsx from 'clsx';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { ListBox, ListBoxItem, type Selection } from 'react-aria-components';
import { m } from '../../lib/paraglide/messages.js';
import { stepSlide, type SlideOverflow } from './overflow';
import { SlideImage } from './SlideImage';

export interface SlideListProps {
  /** Identifies the rendered deck; part of each thumbnail's URL. */
  hash: string;
  /** How many slides to list, and which of them have no PDF page behind them. */
  overflow: SlideOverflow;
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
}

/** The one place the `data-slide` contract below is spelled out. */
function slideElement(list: HTMLElement | null, slide: number) {
  return list?.querySelector<HTMLElement>(`[data-slide="${slide}"]`) ?? null;
}

export function SlideList({ hash, overflow, activeSlide, onActiveSlideChange }: SlideListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  const items = useMemo(
    () => Array.from({ length: overflow.slideCount }, (_, index) => ({ id: index + 1 })),
    [overflow.slideCount],
  );

  // Bring the active slide to the top of the list whenever it changes, whether the
  // change came from in here or from the caret moving in the editor. Its
  // scroll-padding-top keeps the list's own padding above it.
  //
  // RAC scrolls the focused item into view by itself, but that is not a substitute:
  // it only aims for "minimally visible" rather than the top, and it only fires on
  // focus changes, so it would sit out every editor-driven change. Since this effect
  // has to exist anyway, the list is made the scroll container so that the two are
  // never pulling on different elements.
  useEffect(() => {
    const target = slideElement(listRef.current, activeSlide);
    if (!target) return;
    // The first scroll after the list mounts — page load, or the panel being
    // reopened — is instant; navigating with the list already open animates.
    target.scrollIntoView({ block: 'start', behavior: hasScrolled.current ? 'smooth' : 'auto' });
    hasScrolled.current = true;
  }, [activeSlide]);

  function step(delta: number) {
    const target = stepSlide(overflow, activeSlide, delta);
    if (target === activeSlide) return;
    onActiveSlideChange(target);
    // Selection is controlled, but RAC exposes no way to control which item holds
    // DOM focus, so moving only the selection would strand focus on the old item
    // and make the next ArrowDown look like it went backwards. Scrolling is the
    // effect above's job — hence preventScroll.
    slideElement(listRef.current, target)?.focus({ preventScroll: true });
  }

  // A vertical ListBox navigates with ArrowUp/ArrowDown and ignores the horizontal
  // arrows; mirror prev/next onto them too, which is what the slideshow page does
  // with every arrow key. The handler sits on a wrapper because RAC forwards only
  // a fixed set of global DOM events to the ListBox element, and keyboard events
  // are not among them — the events still arrive here by bubbling from the item.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    step(event.key === 'ArrowLeft' ? -1 : 1);
    event.preventDefault();
  }

  function handleSelectionChange(keys: Selection) {
    // Single selection, so `'all'` is unreachable and the set holds one key.
    if (keys === 'all') return;
    const [selected] = keys;
    if (selected !== undefined) onActiveSlideChange(Number(selected));
  }

  return (
    <div className="h-full" onKeyDown={handleKeyDown}>
      <ListBox
        ref={listRef}
        // RAC's ListBox has no Label subcomponent, so the list is named here
        // rather than by a visually hidden element.
        aria-label={m.slide_list_label()}
        items={items}
        // The item renderer closes over these, and RAC caches rendered items by
        // item identity — without this, a new deck of the same length would keep
        // the old thumbnails.
        dependencies={[hash, overflow.overflowStart]}
        selectionMode="single"
        // Move-selects, so arrowing through the list drives the editor as it goes.
        selectionBehavior="replace"
        disallowEmptySelection
        selectedKeys={new Set([activeSlide])}
        onSelectionChange={handleSelectionChange}
        // The list is the scroll container. It expects a parent with a definite
        // height that is also a `container-type: size` container: --scroll-tail is
        // measured in container query units, and a container cannot query itself.
        className="h-full scroll-p-1 overflow-y-auto overscroll-none p-1 pb-[var(--scroll-tail)] outline-none"
      >
        {({ id: slide }) => (
          <ListBoxItem
            // Required: the children are a thumbnail and a number rather than
            // text, so typeahead — which RAC has no way to switch off — has nothing
            // to match on otherwise. Typing a slide number jumps to it.
            textValue={String(slide)}
            // Our own handle for the two imperative moves above. RAC does not put
            // the item's key in the DOM, but it does pass arbitrary data-* through.
            data-slide={slide}
            className={({ isSelected, isFocusVisible }) =>
              clsx(
                'flex items-start gap-2 rounded-lg p-3 select-none',
                isSelected && 'bg-blue-200',
                // Tailwind has no `outline-auto`. Both declarations are needed:
                // the WebKit keyword gives the platform focus ring where it is
                // understood, and is dropped as invalid everywhere else, leaving
                // the plain `auto` behind.
                isFocusVisible && '[outline:auto] [outline:auto_-webkit-focus-ring-color]',
              )
            }
          >
            {({ isSelected }) => (
              <>
                {slide < overflow.overflowStart ? (
                  <div className="aspect-[var(--slide-aspect)] min-w-0 flex-1 shadow-sm">
                    <SlideImage hash={hash} slide={slide} />
                  </div>
                ) : (
                  <div className="grid aspect-[var(--slide-aspect)] min-w-0 flex-1 place-items-center border border-dashed border-gray-200 text-sm text-gray-500">
                    {m.slide_beyond_pdf_pages_label({ n: slide })}
                  </div>
                )}
                <span
                  className={clsx(
                    'min-w-6 text-right text-sm',
                    isSelected ? 'font-semibold text-blue-700' : 'text-gray-400',
                  )}
                >
                  {slide}
                </span>
              </>
            )}
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}
