import {
  LocalizedStringDictionary,
  LocalizedStringFormatter,
  type LocalizedString,
  type LocalizedStrings,
  type Variables,
} from '@internationalized/string';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocale } from 'react-aria-components';
import { type IntlCatalog, intlMessages } from '../lib/intlMessages';

// This is the fallback of plans/react-rewrite-spec.md §6.5, taken because §6.6's
// first two steps both fail as measured against react-aria-components@1.19.0:
//
//   1. RAC's public exports carry `I18nProvider`, `useLocale`, `isRTL` and
//      `useFilter` — not `useLocalizedStringFormatter`.
//   2. `@react-aria/i18n@3.13.1` is now a re-export shim whose own dependency is
//      `react-aria: ^3.48.0`, while RAC pins `react-aria: 3.50.0` exactly. There
//      is no version of the shim we can pin that pins react-aria in turn, so the
//      moment react-aria 3.51 ships, the floating range and the exact pin resolve
//      apart and two `I18nContext` copies enter the tree. That failure is silent:
//      the app only ever reads `navigator.language`, so nothing breaks at runtime
//      and only §8.6's `<I18nProvider locale="en-US">` stops taking effect.
//
// So the formatter is built here instead. `useLocale` still comes from RAC, which
// keeps this on the same context RAC's own components and the tests' I18nProvider
// use, and no react-aria package becomes a direct dependency.

type MessageKey = keyof IntlCatalog;

/** `[args]` for the messages written as functions, `[]` for the plain strings. */
type MessageArgs<K extends MessageKey> = IntlCatalog[K] extends (args: infer A) => string
  ? [A]
  : [];

/**
 * What `useMessages()` hands back.
 *
 * Named so that React-free modules can take a formatter as a parameter — the
 * `import type` costs them no runtime dependency on this file, and none on React
 * (§5.7's `describeSlidesMeta` is the case that needs it).
 */
export type MessageFormatter = <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => string;

// The cast is the seam between two type systems, and it has to go through
// `unknown`: a message in `LocalizedStrings` takes `Variables` (any record, or
// nothing), while intlMessages.ts types each message's arguments exactly, and a
// narrower parameter is not a subtype of a wider one. Nothing is lost — the two
// describe the same objects, and MessageArgs restores the precision at the call
// site, so the looseness stops at this line.
//
// `defaultLocale` is spelled out rather than left to the constructor's default,
// since intlMessages' locale keys are chosen to line up with exactly this value.
const dictionary = new LocalizedStringDictionary(
  intlMessages as unknown as LocalizedStrings<MessageKey, LocalizedString>,
  'en-US',
);

/**
 * Returns a formatter for the browser's locale.
 *
 * There is no `I18nProvider` in the app: `useLocale` falls back to reading
 * `navigator.language` (validated, defaulting to `en-US`, re-rendering on
 * `languagechange`), and the catalog is picked by the dictionary's own matching.
 * Tests wrap `I18nProvider` to pin the locale; the app never does.
 */
export function useMessages(): MessageFormatter {
  const { locale } = useLocale();
  const formatter = useMemo(() => new LocalizedStringFormatter(locale, dictionary), [locale]);
  return useCallback(
    <K extends MessageKey>(key: K, ...args: MessageArgs<K>) =>
      formatter.format(key, args[0] as Variables),
    [formatter],
  );
}

/**
 * Keeps `<html lang>` on the language actually being displayed.
 *
 * The value comes from the catalog, not from the resolved locale: with two
 * catalogs a `fr-FR` browser is an ordinary case, and it is shown English, so
 * `lang="fr-FR"` would tell assistive technology the wrong thing. `dir` is static
 * in index.html — both catalogs are LTR. React cannot render `<html>` here (no
 * SSR, the root mounts into `#root`), so this is an effect, the same layer as
 * setting `document.title`.
 */
export function useHtmlLang() {
  const format = useMessages();
  const lang = format('htmlLang');
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}
