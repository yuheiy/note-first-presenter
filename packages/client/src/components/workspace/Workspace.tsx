import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import clsx from 'clsx';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Button, Link, Radio, RadioGroup, TooltipTrigger } from 'react-aria-components';
import { m } from '../../lib/paraglide/messages.js';
import { slideshowHref } from '../../lib/routes';
import { ErrorOverlay } from '../ErrorOverlay';
import { Hint } from '../Hint';
import { computeSlideOverflow } from '../slides/overflow';
import { SlideList } from '../slides/SlideList';
import { describeSlidesMeta, type SlidesMeta } from '../slides/slidesMeta';
import { useSyncPublisher } from '../slides/sync';
import { Tooltip } from '../Tooltip';
import type { Resource, ResourceStatus } from '../useResource';
import { useListOpen } from './listOpen';
import { useTheme, type ThemeMode } from './theme';

export interface WorkspaceProps {
  /** The presentation's title, for the browser tab. Already defaulted by the caller. */
  title: string;
  /**
   * Note groups in the outline. Half of the deck's length — the other half is
   * the PDF's page count — and deliberately not the outline itself: this number
   * only moves when a `---` is added or removed, so the slide list is spared a
   * re-render per keystroke.
   */
  groupCount: number;
  /** Where the stored document has got to. The outliner and the list wait on it. */
  status: ResourceStatus;
  meta: Resource<SlidesMeta>;
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
  /**
   * The toolbar's leading area: an editable field in the Editor, a heading in
   * the Viewer. A `ReactNode` rather than a render prop — the shell has nothing
   * to hand back.
   */
  titleArea: ReactNode;
  /** The outline editor, or nothing while the document is still loading. */
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
  groupCount,
  status,
  meta,
  activeSlide,
  onActiveSlideChange,
  titleArea,
  outliner,
}: WorkspaceProps) {
  const [theme, setTheme] = useTheme();
  const [listOpen, setListOpen] = useListOpen();

  const resolved = meta.data?.kind === 'resolved' ? meta.data : null;
  const overflow = computeSlideOverflow(resolved?.pageCount ?? 0, groupCount);
  // The deck's real aspect ratio once the meta lands, 16:9 until then. Drives
  // both the overflow placeholders and --scroll-tail below.
  const slideAspect =
    resolved?.width && resolved.height ? resolved.width / resolved.height : 16 / 9;

  useSyncPublisher(activeSlide, overflow.slideCount);

  const pageTitle = m.browser_tab_title({ title });
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  function slidePanel(): ReactNode {
    // Neither half of the deck's length is known yet: the note-group count comes
    // from the document, the page count from the metadata. Waiting on both is
    // what puts the ellipsis here rather than an empty panel — `describeSlidesMeta`
    // says nothing while a request is still in flight, by design.
    if (status !== 'ready' || meta.status === 'loading') return <Hint message="…" />;
    if (resolved) {
      return (
        <SlideList
          hash={resolved.hash}
          overflow={overflow}
          activeSlide={activeSlide}
          onActiveSlideChange={onActiveSlideChange}
        />
      );
    }
    // Every other shape the server can answer with is a sentence to show rather
    // than a deck to draw. The slideshow page shows the same sentences.
    const state = describeSlidesMeta(meta.data, meta.error);
    if (!state) return null;
    return state.tone === 'hint' ? (
      <Hint message={state.message} />
    ) : (
      <ErrorOverlay message={state.message} />
    );
  }

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

      <div className="[container-type:size] relative scroll-pt-4 overflow-auto overscroll-none">
        {status === 'error' ? <ErrorOverlay message={m.outline_load_failed_status()} /> : outliner}
      </div>

      {listOpen && (
        // Scrolling and padding belong to the ListBox inside; what stays
        // here is the panel's chrome and its `container-type: size`, which
        // --scroll-tail queries and ErrorOverlay's `absolute inset-0` positions
        // against.
        <div className="[container-type:size] border-l border-gray-200 bg-gray-50">
          {slidePanel()}
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
