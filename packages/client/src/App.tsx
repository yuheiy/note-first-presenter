import { lazy, Suspense } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useBrowserLocation } from 'wouter/use-browser-location';
import { useHashLocation } from 'wouter/use-hash-location';
import { SLIDESHOW_PATH, type RouterMode } from './lib/urls';

// React.lazy keeps the two pages split: the slideshow window never downloads
// the workspace chunk (ProseMirror and friends).
const WorkspacePage = lazy(() => import('./routes/index'));
const SlideshowPage = lazy(() => import('./routes/slideshow'));

/**
 * The composition root: wouter matching the URL to a page. Props rather than
 * the define constant and `BASE_URL`, so the mode this build did not pick is
 * still reachable from a test — `main.tsx` is the one place the constants are
 * bound.
 *
 * wouter's job ends at this matching. The slide index is not part of it (it is
 * the `?slide=` param, owned by `components/slides/activeSlide.ts`), and the
 * one link opens a separate document — so no `<Link>` (navigates in-document
 * regardless of `target`) and no `useSearchParams` (cannot clear the query in
 * hash mode). See ADR-0017.
 */
export function App({ mode, base }: { mode: RouterMode; base: string }) {
  return (
    <Router
      hook={mode === 'hash' ? useHashLocation : useBrowserLocation}
      // In hash mode the route lives entirely in the hash, so a deploy works
      // at any depth without being told its base. In history mode wouter
      // strips the base with a bare `slice`, so the trailing slash Vite
      // guarantees on BASE_URL has to come off first — passed verbatim,
      // `/sub/` would leave a slash-less `slideshow` that matches nothing.
      base={mode === 'hash' ? '' : base.replace(/\/$/, '')}
    >
      <Suspense fallback={null}>
        <Switch>
          <Route path={SLIDESHOW_PATH} component={SlideshowPage} />
          {/* Any URL that is not the slideshow is the workspace: no route fails
              to resolve to a page. A RegExp rather than a pathless Route —
              wouter marks a location outside the base with a leading `~`, which
              the implicit `*` of a pathless Route does not match, so a pathless
              fallback would render *nothing* there. */}
          <Route path={/.*/} component={WorkspacePage} />
        </Switch>
      </Suspense>
    </Router>
  );
}
