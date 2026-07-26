import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from 'react-aria-components';
import { loadSlidesMeta } from './components/slides/slidesMeta';
import { loadDb } from './components/workspace/db';
import { getLocale } from './lib/paraglide/runtime.js';
import { currentRoutePath, SLIDESHOW_PATH } from './lib/routes';
import './style.css';

// Two pages off one index.html, in whichever router mode the CLI was told to
// build for (docs/adr/0017). Still no router library and no listener: the pages
// are never navigated between inside one document — the slideshow is always
// opened into a separate window (target="nfp-slideshow") and has no way back —
// so choosing the page is one read of the URL at startup. The slide index is not
// part of that choice; it is a `?slide=` search param.
//
// React.lazy keeps the split: the slideshow window never downloads the
// workspace chunk (ProseMirror and friends).
const WorkspacePage = lazy(() => import('./pages/Workspace'));
const SlideshowPage = lazy(() => import('./pages/Slideshow'));

const Page = currentRoutePath() === SLIDESHOW_PATH ? SlideshowPage : WorkspacePage;

// Both pages read both documents, so ask for them here rather than from the
// page's own effect: the requests then overlap the chunk download instead of
// queueing behind it. The loaders cache, so the effect that consumes them —
// which StrictMode runs twice — reuses these requests.
void loadDb();
void loadSlidesMeta();

// Everything the app does with its locale, in one place above both pages. Read
// once per document and never re-read, so a browser language change takes effect
// on the next load rather than immediately (ADR-0016) — which is also why
// `<html lang>` is a plain assignment here rather than an effect. Both pages are
// served from the same index.html, so doing this once reaches both.
const locale = getLocale();
document.documentElement.lang = locale;

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root mount point');

createRoot(container).render(
  <StrictMode>
    {/* Hands RAC the locale Paraglide resolved, rather than letting it read
        `navigator.language` on its own. Nothing RAC renders today is localized by
        RAC, so this changes nothing on screen; it is here so that the day a Select
        or a Table arrives, its strings cannot disagree with ours. */}
    <I18nProvider locale={locale}>
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </I18nProvider>
  </StrictMode>,
);
