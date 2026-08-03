# client の i18n を Paraglide に移す

`@internationalized/string` + RAC の `useLocale()` 相乗りをやめ、**Paraglide JS 2**（コンパイラ型 i18n）に移す。メッセージは `packages/client/messages/{en,ja}.json`、生成物は `src/lib/paraglide/`（gitignore、外部 import ゼロの self-contained なコードなので `@inlang/paraglide-js` は devDependency で足りる）。

動機は2つ: react-aria への i18n 依存を切る（`@react-aria/i18n` を直接足すと `I18nContext` が2コピー入り得る — ADR-0015）ことと、`as unknown as LocalizedStrings<…>` のキャスト + 条件型パズル約40行を消すこと。引き換えに失ったもの: メッセージ引数の型は `NonNullable<unknown>` に緩む（実引数は周囲の型で守られている）、ロケール間のキー整合は型でなくテストで守る、翻訳者向け doc コメントの置き場が無い（キー名に判断を吸収させる — 例 `slides_missing_hint` の `hint` が「エラーではなく正常状態の案内」を担う）。

## 設計決定

- **ロケールの源は Paraglide、RAC はそれに追従する。** `main.tsx` が `getLocale()` を読んで `<html lang>` を代入し、`<I18nProvider locale>` に渡す。依存の向きが「RAC → アプリ」から「アプリ → RAC」に反転したので、react-aria のコピーが割れてもこちらのメッセージには影響しない（ADR-0015 の懸念の構造的解消）。
- `locales: ["en", "ja"]`、`baseLocale: "en"`、strategy は `["preferredLanguage", "baseLocale"]`。切替 UI・cookie・localStorage は無いので入れない。`languagechange` には追従しない（反映は次回読み込み時。RAC 時代からの後退だが、OS 言語変更の頻度に対して割に合わない）。
- **生成物は gitignore し、`prepare` + ルート入口スクリプトの `vp run messages` 前置で作る。** pnpm はインストール作業が発生したときしか `prepare` を走らせないので、クリーンなツリーや CI では前置が必要。`vp check` だけは組み込みコマンドで前置できないため、未解決 import が出たら `vp run messages`（CLAUDE.md に記載）。
- **Paraglide の Vite plugin は CLI の `createViteConfig` に入れない。** `clientRoot` は公開ユーザーの `node_modules/@note-first-presenter/client` に解決されるので、他人のパッケージディレクトリへのコード生成になる（read-only FS で落ち、install のたびに消える）。〔2026-07-28 追記〕この規則は既定値にも及ぶ — Vite の `cacheDir` 既定（`<root>/node_modules/.vite`)がまさに同じ違反で、`projectCwd` 側へ移した（正本は `vite/index.ts` のコメント）。
- **コンパイラのオプションは CLI フラグで渡す**（Paraglide に設定ファイルは無い。`project.inlang/settings.json` は inlang プロジェクトの設定でコンパイラオプションを受け付けない）。フラグ列の正本は client の `compile-messages` スクリプト1箇所で、watch 側は `vp run compile-messages --watch` で呼び直す（複製するとズレたとき dev だけ既定 strategy で走る静かな事故になる）。
- **dev 中の再生成**はルート `dev` = `vp run messages && vp run --filter client --filter demo --parallel dev`。`-r` はルート自身を含んで再帰するため使えず、`vp run` は先頭1つしかタスク名と見なさない（CLAUDE.md の規則の出所）。`concurrently` は `vp run` を子に置くと `os error 22` で落ちるため不可。
- **テストのロケールは3層とも明示的に固定する**: node は固定不要（`navigator` が無く `baseLocale` に落ちる）、browser は `vitest-setup.browser.ts` の `overwriteGetLocale(() => 'en')`、e2e は `playwright.config.ts` の `use: { locale: 'en-US' }`（e2e は移行前から固定されていない穴だった）。browser 層は `<I18nProvider>` でスコープする形が使えない — Paraglide のロケールは React context ではなくモジュール状態。
- **失われた型保証は `messageCatalogs.test.ts` で張り直す**: 宣言ロケールの網羅・キー一致・プレースホルダ一致の3点。文言のテストはメッセージ関数同士の比較で書く（検証対象は「どのキーを選んだか」であり、文言変更で壊れない）。
- キーは snake_case。UI のテーブルはキー文字列でなく**メッセージ関数そのもの**を持つ（`m[key]()` は木揺すりを殺す — CLAUDE.md の規則の出所）。

## Considered Options

- **移行しない**: 検討に値した（動機1だけなら `navigator.languages` を自前で読めば済む）。キャスト除去・外部ツールが読める形式・木揺すり可能な出力を合わせて採る判断で進めた。
- **生成物を commit する**: 却下。45ファイルが diff に乗り続け、`messages/*.json` との古びを別途封じる必要が出る。
- **`@inlang/paraglide-js-react`**: 却下。メッセージ内マークアップ用で、全メッセージがプレーンテキストの現状では ReactNode を返す分だけ使える場所が減る（`aria-label` / `alt` / `document.title` は文字列必須）。
