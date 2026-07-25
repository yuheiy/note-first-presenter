/**
 * The message catalogs. Plain data — this module imports nothing and is fed to
 * `LocalizedStringDictionary` in components/useMessages.ts, which is where the
 * React side lives. See plans/react-rewrite-spec.md §6.
 *
 * Keys are flat camelCase and the catalog cannot nest: `LocalizedStringDictionary`
 * expects `Record<K, LocalizedString>`. Messages that take parameters are written
 * as function literals because `LocalizedStringFormatter.format()` interpolates
 * only when the message is a function — it never substitutes into a plain string.
 *
 * The doc comment on each message is context for whoever translates it.
 */

const enUS = {
  /**
   * The language tag written to `<html lang>` while this catalog is displayed.
   * Not a translation of anything — it is the language of the catalog itself,
   * so it stays a bare language subtag.
   */
  htmlLang: 'en',

  /** Accessible label of the toolbar text field holding the presentation's title. */
  titleLabel: 'Title',
  /** Placeholder shown in the title field, and used as the document title, while the title is empty. */
  titleDefault: 'Untitled',

  /** Group label of the light/dark theme selector. */
  themeLabel: 'Theme',
  /** Theme option: follow the operating system's light/dark setting. */
  themeSystem: 'System',
  /** Theme option: always light. */
  themeLight: 'Light',
  /** Theme option: always dark. */
  themeDark: 'Dark',

  /** Status shown when writing the outline back to disk failed. The edit is still on screen; only the save was lost. */
  saveError: 'Failed to save',
  /** Status shown when the outline could not be read at startup, so the editor has nothing to show. */
  loadError: 'Failed to load. Please reload the page.',

  /** Accessible label of the control that opens the slideshow in a second window. */
  openSlideshow: 'Play slideshow',
  /** Accessible label of the control that shows and hides the slide list. */
  toggleSlideList: 'Toggle slide list',
  /** Accessible label of the slide list itself. */
  slideListLabel: 'Slides',

  /** Error shown when the PDF named in the config file is not on disk. `path` is that configured path. */
  errorSlidesNotFound: ({ path }: { path: string }) => `Configured PDF not found: ${path}`,
  /** Error shown when the project has several PDFs and no config says which one to use. `files` is a comma-separated list of the file names found. */
  errorMultiplePdfs: ({ files }: { files: string }) =>
    `Multiple PDFs found: ${files}. Specify one in note-first-presenter.config.ts.`,
  /** Guidance shown when the project has no PDF at all. Not an error: writing notes without slides is a valid state. */
  infoNoSlides: 'Add a PDF to the project root or set slides in note-first-presenter.config.ts.',

  /** Label for a note group that has no slide behind it because the outline has more groups than the PDF has pages. `n` is the 1-based group number. */
  overflowLabel: ({ n }: { n: number }) => `Slide ${n} (overflow)`,
  /** Browser tab title. `title` is the presentation's title, or `titleDefault` when it is empty. */
  pageTitle: ({ title }: { title: string }) => `Presenter: ${title}`,
};

export type IntlCatalog = typeof enUS;

// Same keys and same argument types as enUS — the annotation is what enforces it,
// which is why §8.1 N3 leaves key coverage untested.
const jaJP: IntlCatalog = {
  htmlLang: 'ja',

  titleLabel: 'タイトル',
  titleDefault: '名称未設定',

  themeLabel: 'テーマ',
  themeSystem: 'システム',
  themeLight: 'ライト',
  themeDark: 'ダーク',

  saveError: '保存に失敗しました',
  loadError: '読み込みに失敗しました。ページを再読み込みしてください。',

  openSlideshow: 'スライドショーを再生',
  toggleSlideList: 'スライド一覧を開閉',
  slideListLabel: 'スライド',

  errorSlidesNotFound: ({ path }) => `設定された PDF が見つかりません: ${path}`,
  errorMultiplePdfs: ({ files }) =>
    `PDF が複数見つかりました: ${files}。note-first-presenter.config.ts で 1 つに指定してください。`,
  infoNoSlides:
    'プロジェクト直下に PDF を追加するか、note-first-presenter.config.ts で slides を設定してください。',

  overflowLabel: ({ n }) => `スライド ${n} (超過)`,
  pageTitle: ({ title }) => `プレゼンター: ${title}`,
};

/**
 * Locale keys are full `language-REGION` tags on purpose. `LocalizedStringDictionary`
 * falls back to `strings[defaultLocale]` and its default `defaultLocale` is `'en-US'`,
 * so keying this by `'en'` / `'ja'` would make a `fr-FR` browser look up
 * `strings['en-US']`, get `undefined`, and throw on the next property read.
 * With region tags every path lands: `fr-FR` → `'en-US'`, `ja` → `'ja-JP'` via the
 * prefix match, `en-GB` → `'en-US'`.
 */
export const intlMessages = {
  'en-US': enUS,
  'ja-JP': jaJP,
};
