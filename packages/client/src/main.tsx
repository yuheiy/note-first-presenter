import { getDefaultStore } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from 'react-aria-components';
import { App } from './App';
import { slidesMetaAtom } from './components/slides/slidesMeta';
import { storedDbAtom } from './components/workspace/db';
import { getLocale } from './lib/paraglide/runtime.js';
import './style.css';

// Bootstrap only: everything here is a side effect a test never wants — binding
// the build's define constants, warming the default store, mounting. Which page
// the URL means is `App.tsx`'s business.

// Both pages read both documents, so ask for them here rather than from a page:
// the requests then overlap the chunk download instead of queueing behind it.
// The store caches, so the components that read them — including the second of
// StrictMode's doubled renders — reuse these requests rather than firing more.
//
// No Provider anywhere in the tree, so the default store is the one the app
// reads. Tests inject their own with `<Provider store={createStore()}>`, which
// jotai prefers over this one and which is what lets each test start clean.
//
// Caught, not handled: the ErrorBoundary around whoever reads the atom is what
// reports a failure. Without this, warming a request nobody has awaited yet
// would surface as an unhandled rejection.
const store = getDefaultStore();
void store.get(storedDbAtom).catch(() => {});
void store.get(slidesMetaAtom).catch(() => {});

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
      <App mode={__NFP_ROUTER_MODE__} base={import.meta.env.BASE_URL} />
    </I18nProvider>
  </StrictMode>,
);
