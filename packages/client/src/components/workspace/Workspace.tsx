import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { Suspense, useEffect, type CSSProperties, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button, Link, Radio, RadioGroup, TooltipTrigger } from 'react-aria-components';
import { m } from '../../lib/paraglide/messages.js';
import { slideshowHref } from '../../lib/urls';
import { ErrorOverlay, reason } from '../ErrorOverlay';
import { activeSlideAtom } from '../slides/activeSlide';
import { Hint } from '../Hint';
import { SlideCountPublisher } from '../slides/SlideCountPublisher';
import { SlidePanel } from '../slides/SlidePanel';
import { slideAspectAtom } from '../slides/slidesMeta';
import { Tooltip } from '../Tooltip';
import { titleAtom } from './db';
import { useListOpen } from './listOpen';
import { useTheme, type ThemeMode } from './theme';

export interface WorkspaceProps {
  /**
   * The toolbar's leading area: an editable field in the Editor, a heading in
   * the Viewer. A `ReactNode` rather than a render prop — the shell has nothing
   * to hand back.
   */
  titleArea: ReactNode;
  /** The outline editor. Suspends until the document lands; the shell does not. */
  outliner: ReactNode;
}

// --scroll-tail: trailing scroll space below the slide list and the outliner so
// the last slide (or note group) can be scrolled to the top — one panel height
// minus one slide's height (a thumbnail spanning the panel: 100cqw / aspect, plus
// a tuned +19.5px for fixed item chrome), minus the slide list's scroll-padding-top
// (scroll-p-1 = 0.25rem) so the last slide rests where an active slide scrolls to.
// Clamped to >= 0 for portrait decks where a thumbnail is taller than the panel.
// Both panels use this same value so their bottom spacing matches. It resolves per
// scroll container via container-query units; the panels set `container-type: size`.
const SCROLL_TAIL_CLASS =
  '[--scroll-tail:max(0px,calc(100cqh_-_100cqw/var(--slide-aspect)_+_19.5px_-_0.25rem))]';

/**
 * The workspace shell: toolbar, outliner panel, slide list, theme footer.
 *
 * Everything it owns is something that stops here — the colour scheme, whether
 * the list is showing, and the broadcast the slideshow window follows. The
 * active slide is nobody's prop: it is `activeSlideAtom`, read by exactly the
 * components that render or write it, so the shell never re-renders for a
 * slide change it does not draw.
 */
export function Workspace({ titleArea, outliner }: WorkspaceProps) {
  const [listOpen, setListOpen] = useListOpen();

  // --slide-aspect has to live on the root grid, because both panels'
  // --scroll-tail queries it. `slideAspectAtom` is shaped so that a read here
  // can neither suspend nor throw; see its docblock for why that matters.
  const slideAspect = useAtomValue(slideAspectAtom);

  return (
    <div
      className={clsx(
        'grid h-svh grid-rows-[auto_1fr_auto]',
        listOpen ? 'grid-cols-2' : 'grid-cols-1',
        SCROLL_TAIL_CLASS,
      )}
      // React's CSSProperties has no room for custom properties, so the cast is
      // the only way to hand one to the style attribute.
      style={{ '--slide-aspect': slideAspect } as CSSProperties}
    >
      <BrowserTabTitle />

      <Toolbar
        titleArea={titleArea}
        listOpen={listOpen}
        onToggleList={() => {
          setListOpen(!listOpen);
        }}
      />

      {/* Publishes nothing until both halves of the deck's length are known, so
          it sits behind its own boundaries rather than the shell's: a failed
          request should silence the broadcast, not blank the workspace. */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <SlideCountPublisher />
        </Suspense>
      </ErrorBoundary>

      <OutlinerPane>{outliner}</OutlinerPane>

      {listOpen && <SlideListPane />}

      <ThemeFooter />
    </div>
  );
}

const TOOLBAR_BUTTON =
  'flex min-h-7 min-w-8 items-center justify-center rounded text-sm text-gray-800 transition duration-100 hover:bg-gray-200';

interface ToolbarProps {
  titleArea: ReactNode;
  listOpen: boolean;
  onToggleList: () => void;
}

/**
 * The toolbar row: the page's title area, the slideshow opener, the slide-list
 * toggle. Deliberately not RAC's `Toolbar`: `useToolbar` hijacks
 * ArrowLeft/Right with no exception for text inputs, which would break caret
 * movement in the title TextField sitting in `titleArea` (docs/adr/0015).
 */
function Toolbar({ titleArea, listOpen, onToggleList }: ToolbarProps) {
  const activeSlide = useAtomValue(activeSlideAtom);

  return (
    <div className="col-span-full flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-1">
      {titleArea}
      <TooltipTrigger>
        {/* A real document load, not an in-app transition — RAC's Link, never
            wouter's, whose click handler navigates in-document regardless of
            `target` (ADR-0017). The href knows the router mode and the base,
            which lib/urls.ts is the only place to know. The named target is
            what makes the slideshow reuse its own window rather than pile up
            new ones. */}
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
          onPress={onToggleList}
          className={TOOLBAR_BUTTON}
        >
          <SidebarSimpleIcon size="1.25em" weight={listOpen ? 'duotone' : 'regular'} mirrored />
        </Button>
        <Tooltip>{m.toggle_slide_list_button_label()}</Tooltip>
      </TooltipTrigger>
    </div>
  );
}

/**
 * The outliner's pane, and both of its boundaries — not just the error one. A
 * slot is still a child, so without the Suspense here the outliner's wait would
 * travel up to the entry's boundary and blank the toolbar and the footer along
 * with it — measured, not assumed. Nothing is drawn while it waits, and one
 * generic message if it fails: which of the two requests broke is not something
 * the reader can act on.
 */
function OutlinerPane({ children }: { children: ReactNode }) {
  return (
    <div className="[container-type:size] relative scroll-pt-4 overflow-auto overscroll-none">
      <ErrorBoundary fallback={<ErrorOverlay message={m.outline_load_failed_status()} />}>
        <Suspense fallback={null}>{children}</Suspense>
      </ErrorBoundary>
    </div>
  );
}

/**
 * The slide list's pane. Scrolling and padding belong to the ListBox inside;
 * what stays here is the panel's chrome and its `container-type: size`, which
 * --scroll-tail queries and ErrorOverlay's `absolute inset-0` positions
 * against.
 *
 * The error fallback shows the transport's own words rather than a catalog
 * entry: a failure to reach the server has no message of ours to show.
 */
function SlideListPane() {
  return (
    <div className="[container-type:size] border-l border-gray-200 bg-gray-50">
      <ErrorBoundary fallbackRender={({ error }) => <ErrorOverlay message={reason(error)} />}>
        <Suspense fallback={<Hint message="…" />}>
          <SlidePanel />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
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

/**
 * The theme picker row. Owns the colour scheme outright — nothing else in the
 * shell reads it — so the hook lives here rather than in `Workspace`.
 */
function ThemeFooter() {
  const [theme, setTheme] = useTheme();

  return (
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
  );
}

/**
 * Names the browser tab. Draws nothing.
 *
 * Reads the title itself rather than taking it as a prop so that a keystroke in
 * the title field re-renders this and nothing else. As a prop it re-rendered the
 * whole shell — the slide list included — per character, which is the cost the
 * fine-grained selectors exist to avoid.
 */
function BrowserTabTitle() {
  const title = useAtomValue(titleAtom) || m.untitled_title_placeholder();
  const pageTitle = m.browser_tab_title({ title });
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  return null;
}
