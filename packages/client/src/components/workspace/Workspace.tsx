import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { Suspense, useEffect, type CSSProperties, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button, Link, Radio, RadioGroup, TooltipTrigger } from 'react-aria-components';
import { m } from '../../lib/paraglide/messages.js';
import { slideshowHref } from '../../lib/routes';
import { ErrorOverlay, reason } from '../ErrorOverlay';
import { Hint } from '../Hint';
import { SlideCountPublisher, SlidePanel } from '../slides/SlidePanel';
import { DEFAULT_SLIDE_ASPECT, slideAspectAtom } from '../slides/slidesMeta';
import { Tooltip } from '../Tooltip';
import { useListOpen } from './listOpen';
import { useTheme, type ThemeMode } from './theme';

export interface WorkspaceProps {
  /** The presentation's title, for the browser tab. Already defaulted by the caller. */
  title: string;
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
  /**
   * The toolbar's leading area: an editable field in the Editor, a heading in
   * the Viewer. A `ReactNode` rather than a render prop — the shell has nothing
   * to hand back.
   */
  titleArea: ReactNode;
  /** The outline editor. Suspends until the document lands; the shell does not. */
  outliner: ReactNode;
}

// The label is the message function itself rather than a key to look up: a
// dynamic `m[someKey]()` would defeat the tree-shaking that is the point of
// compiling messages.
const THEME_OPTIONS: {
  mode: ThemeMode;
  label: () => string;
}[] = [
  { mode: 'system', label: m.theme_option_system },
  { mode: 'light', label: m.theme_option_light },
  { mode: 'dark', label: m.theme_option_dark },
];

const TOOLBAR_BUTTON =
  'flex min-h-7 min-w-8 items-center justify-center rounded text-sm text-gray-800 transition duration-100 hover:bg-gray-200';

/**
 * The workspace shell: toolbar, outliner panel, slide list, theme footer.
 *
 * Everything it owns is something that stops here — the colour scheme, whether
 * the list is showing, and the broadcast the slideshow window follows. Anything
 * two pages need is owned by the page above and arrives as a prop, so there is
 * no context anywhere in the tree.
 *
 * It broadcasts rather than owns `activeSlide`: publishing needs the effective
 * slide count, and this is the one component holding both halves of it.
 */
export function Workspace({
  title,
  activeSlide,
  onActiveSlideChange,
  titleArea,
  outliner,
}: WorkspaceProps) {
  const [theme, setTheme] = useTheme();
  const [listOpen, setListOpen] = useListOpen();

  // The one read in the shell, and the one that is a value rather than a
  // suspension. It has to be: --slide-aspect lives on the root grid because both
  // panels' --scroll-tail queries it, and a shell that suspended would take the
  // toolbar and the footer down with it. `slideAspectAtom` is an `unwrap`, so it
  // answers `undefined` until the metadata lands and never throws.
  const slideAspect = useAtomValue(slideAspectAtom) ?? DEFAULT_SLIDE_ASPECT;

  const pageTitle = m.browser_tab_title({ title });
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    // --scroll-tail: trailing scroll space below the slide list and the outliner so
    // the last slide (or note group) can be scrolled to the top — one panel height
    // minus one slide's height (a thumbnail spanning the panel: 100cqw / aspect, plus
    // a tuned +19.5px for fixed item chrome), minus the slide list's scroll-padding-top
    // (scroll-p-1 = 0.25rem) so the last slide rests where an active slide scrolls to.
    // Clamped to >= 0 for portrait decks where a thumbnail is taller than the panel.
    // Both panels use this same value so their bottom spacing matches. It resolves per
    // scroll container via container-query units; the panels set `container-type: size`.
    <div
      className={clsx(
        'grid h-svh grid-rows-[auto_1fr_auto]',
        listOpen ? 'grid-cols-2' : 'grid-cols-1',
        '[--scroll-tail:max(0px,calc(100cqh_-_100cqw/var(--slide-aspect)_+_19.5px_-_0.25rem))]',
      )}
      // React's CSSProperties has no room for custom properties, so the cast is
      // the only way to hand one to the style attribute.
      style={{ '--slide-aspect': slideAspect } as CSSProperties}
    >
      <div className="col-span-full flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-1">
        {titleArea}
        <TooltipTrigger>
          {/* A real document load, not an in-app transition: the href knows the
              router mode and the base, which lib/routes.ts is the only place to
              know. The named target is what makes the slideshow reuse its own
              window rather than pile up new ones. */}
          <Link
            href={slideshowHref(activeSlide)}
            target="nfp-slideshow"
            aria-label={m.open_slideshow_button_label()}
            className={TOOLBAR_BUTTON}
          >
            <PlayIcon size="1.25em" weight="duotone" />
          </Link>
          <Tooltip>{m.open_slideshow_button_label()}</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger>
          {/* aria-expanded, not aria-pressed: this shows and hides an adjacent
              section, which WAI-ARIA calls a disclosure. `aria-pressed` would
              claim it is a setting like "bold". */}
          <Button
            aria-expanded={listOpen}
            aria-label={m.toggle_slide_list_button_label()}
            onPress={() => {
              setListOpen(!listOpen);
            }}
            className={TOOLBAR_BUTTON}
          >
            <SidebarSimpleIcon size="1.25em" weight={listOpen ? 'duotone' : 'regular'} mirrored />
          </Button>
          <Tooltip>{m.toggle_slide_list_button_label()}</Tooltip>
        </TooltipTrigger>
      </div>

      {/* Publishes nothing until both halves of the deck's length are known, so
          it sits behind its own boundaries rather than the shell's: a failed
          request should silence the broadcast, not blank the workspace. */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <SlideCountPublisher activeSlide={activeSlide} />
        </Suspense>
      </ErrorBoundary>

      <div className="[container-type:size] relative scroll-pt-4 overflow-auto overscroll-none">
        {/* Both boundaries, not just the error one. A slot is still a child, so
            without the Suspense here the outliner's wait would travel up to the
            entry's boundary and blank the toolbar and the footer along with it —
            measured, not assumed. Nothing is drawn while it waits, which is what
            the shell did before, and one generic message if it fails: which of
            the two requests broke is not something the reader can act on. */}
        <ErrorBoundary fallback={<ErrorOverlay message={m.outline_load_failed_status()} />}>
          <Suspense fallback={null}>{outliner}</Suspense>
        </ErrorBoundary>
      </div>

      {listOpen && (
        // Scrolling and padding belong to the ListBox inside; what stays
        // here is the panel's chrome and its `container-type: size`, which
        // --scroll-tail queries and ErrorOverlay's `absolute inset-0` positions
        // against.
        <div className="[container-type:size] border-l border-gray-200 bg-gray-50">
          {/* The transport's own words rather than a catalog entry: a failure to
              reach the server has no message of ours to show, which is what the
              old `describeSlidesMeta(meta, error)` did with its second argument. */}
          <ErrorBoundary fallbackRender={({ error }) => <ErrorOverlay message={reason(error)} />}>
            {/* The ellipsis the panel used to show while it waited on both
                requests. Now it is the boundary's business rather than a branch
                inside the panel. */}
            <Suspense fallback={<Hint message="…" />}>
              <SlidePanel activeSlide={activeSlide} onActiveSlideChange={onActiveSlideChange} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      <div className="col-span-full flex border-t border-gray-200 bg-gray-50 px-4 py-1">
        <RadioGroup
          aria-label={m.theme_group_label()}
          // RAC defaults to vertical, which would have the group announce an
          // axis its own row layout contradicts.
          orientation="horizontal"
          value={theme}
          // RAC hands back the raw string; the group's values are exactly the
          // three modes, so narrowing it here is safe.
          onChange={(value) => {
            setTheme(value as ThemeMode);
          }}
          className="ml-auto flex gap-3"
        >
          {THEME_OPTIONS.map(({ mode, label }) => (
            <Radio
              key={mode}
              value={mode}
              className="-mx-1 flex items-center gap-1 p-1 text-sm text-gray-800"
            >
              {({ isSelected, isFocusVisible }) => (
                <>
                  {/* RAC hides the native input, so the dot is ours to draw. The
                      selected state thickens the ring into a filled centre. */}
                  <span
                    className={clsx(
                      'size-3 rounded-full border',
                      isSelected ? 'border-4 border-blue-600' : 'border-gray-500',
                      isFocusVisible && '[outline:auto] [outline:auto_-webkit-focus-ring-color]',
                    )}
                  />
                  {label()}
                </>
              )}
            </Radio>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
