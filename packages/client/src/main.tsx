import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// The two pages are never navigated between inside one document: the slideshow
// is always opened into a separate window (target="nfp-slideshow") and has no
// way back. So "routing" is a single read of location.hash at startup — no
// hashchange listener, no history integration, no router library.
// See plans/react-rewrite-spec.md §1.2.
//
// React.lazy keeps the split: the slideshow window never downloads the
// workspace chunk (ProseMirror and friends).
const WorkspacePage = lazy(() => import('./pages/Workspace'));
const SlideshowPage = lazy(() => import('./pages/Slideshow'));

// A bare `/` carries no slide number for the pages to read. replaceState rather
// than location.replace, so normalising does not add a history entry.
if (!window.location.hash) {
  window.history.replaceState(null, '', '#/1');
}

const Page = window.location.hash.startsWith('#/slideshow/') ? SlideshowPage : WorkspacePage;

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root mount point');

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
