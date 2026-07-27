# client の i18n を Paraglide に移す

`@internationalized/string` の `LocalizedStringDictionary` と、RAC の `useLocale()` に相乗りするロケール解決をやめ、**Paraglide JS 2**（コンパイラ型 i18n）に移す。メッセージは `packages/client/messages/{en,ja}.json` に置き、`paraglide-js compile` が `src/lib/paraglide/` に木揺すり可能な関数として吐く。

この決定は ADR-0015 の動機2（「i18n の土台が同梱される」）を部分的に取り消し、`plans/react-rewrite-spec.md` §6 の設計を上書きする。

## 動機

1. **react-aria への i18n 依存を切る。** 旧 `useMessages.ts` の冒頭には15行の言い訳コメントがあった——`useLocalizedStringFormatter` は RAC の公開エクスポートに無く、`@react-aria/i18n` を直接足すと RAC の完全一致ピンと解決がずれて `I18nContext` が2コピー入る、だからフォーマッタは自前で組む、と。ロケールだけ RAC から借りるという形は、その回避策の残骸だった。
2. **型の継ぎ目を消す。** `intlMessages as unknown as LocalizedStrings<MessageKey, LocalizedString>` というキャストと、その精度を呼び出し側で復元するための `MessageArgs<K>` 条件型（コメント込みで約40行）が消える。

**ただし動機2は部分的にしか達成されない。** 収支は次のとおりで、これを承知の上で進めた。

|                                             | 移行前                                   | Paraglide                                        |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| キャスト + `MessageArgs` 型パズル（約40行） | ある                                     | **消える**                                       |
| 引数の型                                    | `{ n: number }` / `{ path: string }`     | **`{ n: NonNullable<unknown> }`**                |
| ロケール間のキー整合                        | `const jaJP: IntlCatalog` の型注釈が強制 | **保証なし・静かに base へフォールバック**       |
| 各メッセージの翻訳者向け doc コメント       | 17個                                     | **書く場所がない**                               |
| hover での原文                              | 実装が見える                             | 生成 `.d.ts` の JSDoc に英語原文がテーブルで載る |

引数型は絞る手段がない。ICU 構文で `{n, number}` と書いても inlang message format はこれを解釈せず、`"n, number": NonNullable<unknown>` という壊れた型を吐く（plural も同様）。キーが片方の locale から落ちた場合は、警告も非ゼロ終了もなく `const ja_x = en_x` にコンパイルされる。

## 設計決定

### ロケールの源は Paraglide、RAC はそれに追従する

依存の向きを「RAC → アプリ」から「アプリ → RAC」へ反転させる。ロケールに関わることは `main.tsx` に集約した——`getLocale()` の読み取りと `<html lang>` の設定がモジュールスコープの2行、`<I18nProvider>` が `<Suspense>` の外側。ロケールは変わらないので `<html lang>` は effect ではなく素の代入で足りる。専用のコンポーネントは切らない（`<I18nProvider locale={locale}>` を1箇所書くだけなので、名前を付けても間接参照が1段増えるだけ）。

`components/` に切らず**エントリに置く**。ドキュメントごとに1回だけ効く設定という点で、`main.tsx` が既に持っている他のもの（hash の正規化、`loadDb()` / `loadSlidesMeta()` の先読み）と同じ性質であり、再利用される見込みもない。

両ページに個別に張る形は採らなかった。`<html lang>` を各ページが自分で書いていたのは「スライドショーは別ドキュメントだから」という理由だったが、両ページとも同じ index.html から起動する（ADR-0014 の hash routing）ので、`main.tsx` に1つ置けば両方のドキュメントに届く。

**このアプリが実際に描画している RAC 由来のローカライズ文字列はゼロ**なので、provider は今日の画面を何も変えない（使用中のプリミティブに対応する namespace が RAC の `i18n/*.mjs` に無い）。置くのは、`Select` や `Table` のように自前文字列を持つコンポーネントが将来入ったとき、その言語がこちらとずれないようにするため。

- `locales: ["en", "ja"]`、`baseLocale: "en"`。region タグを落とした——`en-US` / `ja-JP` だったのは `LocalizedStringDictionary` の既定 `defaultLocale` に合わせる必要があったからで、その制約ごと消えた。
- 副産物として **`htmlLang` メッセージが不要になった**。旧構成では「カタログ自身の言語」を持つ必要があった（`fr-FR` ブラウザは `fr-FR` に解決されながら英語を見せられるので、`lang="fr-FR"` は嘘になる）。Paraglide は `locales` の中にしか解決しないので `getLocale()` がそのまま表示言語であり、それを `<html lang>` に直接書く。

### strategy は `["preferredLanguage", "baseLocale"]`

言語切替 UI は無く、URL は hash routing で locale セグメントを持てず（ADR-0014）、cookie を発行するサーバも無い。`localStorage` は切替 UI が無い限り永遠に空の死に枝なので入れない。

移行前の RAC は `navigator.language`（**単数**）を読んでいたが、`preferredLanguage` は `navigator.languages`（**複数**）を順に見る。「第一言語 fr、第二言語 ja」のユーザーは移行前は英語、移行後は日本語になる——改善方向の非互換として受け入れる。

### `languagechange` には追従しない

ロケールはドキュメントごとに1回読み、以後変わらない。ブラウザの言語設定を変えても、反映は次回読み込み時になる。**これは移行前からの後退である**——RAC の `useDefaultLocale` は `languagechange` を購読して再レンダーしていた。

Paraglide 側に受け皿は**無い**。`@inlang/paraglide-js-react` はメッセージ内マークアップを JSX にマップする別物であり、公式 React サンプルは `setLocale()` 既定のページリロードに丸投げしている。

追従させるなら `useSyncExternalStore` で `languagechange` を購読することになるが、それだけでは足りない——`SlideList` は RAC が描画済み項目をキャッシュするため `dependencies` に locale を足さないと伝播が届かない。ユーザーが OS の言語設定を変える頻度に対して割に合わないと判断した。

### 生成物は gitignore し、`prepare` で作る

`src/lib/paraglide/` は 45 ファイル・約 170KB の生成物なので commit しない。`packages/client` の `prepare` スクリプトが `compile-messages` を呼ぶ。npm の `prepare` は install 時と pack/publish 時の**両方**で走るので、`prepack` は不要（両方書くと pack 時に2回走る）。

**ただし `prepare` だけでは足りない。** pnpm は実際にインストール作業が発生したときしか `prepare` を走らせないので、「node_modules は最新だが `src/lib/paraglide` が無い」状態——クリーンした作業ツリー、node_modules をキャッシュする CI——では `vp install` を叩いても再生成されない。そこでルートの `vp run` 入口（`dev` / `test:unit` / `test:integration` / `test:e2e`）が全て `vp run messages` を前置する。`vp run` は `&&` を独立してキャッシュされるサブタスクに分割するので、既に最新なら実質ゼロコスト。

`vite.config.ts` の `run.tasks` に `dependsOn` を書く形は採れない——これらはルート `package.json` のスクリプトであり、Vite+ は「同名タスクを `vite.config.ts` と `package.json` の両方に定義できない」と明記している。

**`vp check` だけはこの網から漏れる。** `vp run` のタスクではなく組み込みコマンドなので前置できず、`src/lib/paraglide` が無いと未解決 import で11件のエラーを出す。CLAUDE.md にその旨と `vp run messages` を書いた。

- **gitignore は `packages/client/.gitignore` に置く。** 「npm は `.npmignore` の無いパッケージでその `.gitignore` を代用するので tarball からも消える」という懸念は、`files` の allowlist が優先するため成り立たない（`pnpm pack` の中身がパッケージ内 `.gitignore` の有無で変わらないことを確認済み）。`.npmignore` を足す必要もない。
- **CLI は Paraglide を知らない。** `createViteConfig` も `note-first-presenter` の `dependencies` も無変更。生成物は外部 import ゼロの self-contained なコードなので（`urlpattern-polyfill` すら参照しない）、`@inlang/paraglide-js` は client の **devDependency** で足り、ADR-0010 の「全 runtime 依存を `dependencies` に」というトラップを新たに踏まない。
- **副作用として lint 問題も消えた。** Oxfmt / Oxlint / knip はいずれも gitignore されたファイルを走査しないので、生成コードの除外設定はどこにも要らない。

vite plugin を CLI の `createViteConfig` に入れる案は退けた。`clientRoot` は公開ユーザーの `node_modules/@note-first-presenter/client` に解決されるので、**他人のパッケージディレクトリにコード生成する**ことになる。read-only FS（Docker の CI で `build`）で落ち、`pnpm install` のたびに消えて再生成される。

### 追記（2026-07-28）: この規則は Vite の `cacheDir` にも及ぶ

**上の一段落は、明示的に何かを置く判断だけでなく、既定値にも適用されるべきものだった。** Vite は `cacheDir` を `<root>/node_modules/.vite` から導き、`root` は `createViteConfig` では `clientRoot` である（ADR-0014 が `index.html` を client パッケージに置いた帰結）。つまり `dev` は `optimizeDeps` の出力を、まさにここが禁じた場所——公開ユーザーの `node_modules` の中、pnpm なら仮想ストアの中——に書いていた。名指しされている失敗様態（read-only FS、`pnpm install` で消える）もそのまま当てはまる。

見つけたのは ADR-0021 のゲートで、隔離インストールに `dev` を起動して `.vite` の落ち先を見たときである。**書いてある規則の違反を、それを書いた本人が2年分のテストを通しても見なかった**ということで、公開形態を踏む層が無いことの代償がここにも出ていた。

`cacheDir` は `projectCwd` 側の `node_modules/.note-first-presenter/vite` に移した。`slides/pdf.ts` がスライド画像のキャッシュに使っている根と同じで、**プロジェクトの中であって依存の中ではない**。`build` は `projectCwd` を渡さず、実際にこのディレクトリを作らないので（実測）、dev 限定の設定である。

### 出力先は `src/lib/paraglide/`

`src/lib/` は React に依存しないモジュールの置き場（`dbSchema.ts` / `serverClient.ts` / `slideFilename.ts`）であり、Paraglide の出力はまさにそれ——素の関数とモジュールスコープのロケール状態だけで、React を一切知らない。`src/paraglide/` として `src` 直下に置くと、`components/` と `pages/` と `lib/` が並ぶ層に生成物が4つ目として割り込むことになる。

### コンパイラのオプションは CLI フラグで渡す

**Paraglide に設定ファイルは無い。** `project.inlang/settings.json` は inlang プロジェクトの設定（`baseLocale` / `locales` / plugin）であって、コンパイラのオプション（`strategy`、`emit*`、`outputStructure` など）は受け付けない。渡し方は CLI フラグか `compile()` への引数の二択で、前者を採る（`compile()` を呼ぶスクリプトを置くとファイルが1つ増え、`tsconfig` の `include` にも足すことになる）。各フラグの理由:

| フラグ                                    | 理由                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--strategy preferredLanguage baseLocale` | 上記「strategy は」節                                                                                  |
| `--emit-ts-declarations`                  | 出力は `.js`。これが無いと型なしモジュールを import することになる                                     |
| `--no-emit-git-ignore`                    | Paraglide は出力先に `*` だけの `.gitignore` を書く。ignore は `packages/client/.gitignore` で管理する |
| `--no-emit-prettier-ignore`               | この repo は Oxfmt。しかも gitignore 済みなので二重に無意味                                            |
| `--no-emit-readme`                        | Paraglide を LLM に説明する約200行が毎回再生成される。この repo の事情は CLAUDE.md と本 ADR にある     |

### dev 中の再生成は各パッケージの `dev` タスク + `vp run --parallel`

dev サーバは CLI の `createViteConfig` 経由で起動し、そこに Paraglide の Vite plugin を入れていない（上記のとおり、公開ユーザーの `node_modules` に書き込むため）。よってメッセージを編集しても自動では再生成されない。埋め合わせとして、ウォッチャとサーバをそれぞれのパッケージの `dev` タスクにし、ルートから並列実行する:

```
// package.json (root)
"dev": "vp run messages && vp run --filter client --filter demo --parallel dev"
// packages/client
"dev": "vp run compile-messages --watch"
// demo
"dev": "note-first-presenter"
```

- **`-r` は使えず、タスクを2つ並べることもできない。** `-r`（workspace packages）はルート自身も含むので `vp run -r --parallel dev` はルートの `dev` に一致して再帰する。`vp run --parallel client#dev demo#dev` と書くのも不可——`vp run` は先頭だけをタスク名と見て残りをそのコマンドへの引数として渡すので、`demo#dev` が `paraglide-js compile ... --watch 'demo#dev'` になり dev サーバが起動しない。`--filter` を2つ並べるのが唯一の形である（`client` / `demo` のような短縮名で書ける）。
- **フラグ列は client の `compile-messages` 1箇所に保つ。** ウォッチャ側は `vp run compile-messages --watch` でそれを呼び直す（タスク名の後の引数が渡る）。`dev` にフラグを複製すると、ズレたときに dev だけ既定 strategy（`cookie` / `globalVariable`）で走るという静かな事故になる。
- **`vp run messages` の前置は順序保証であり、初回コンパイルの代わりではない**——`--watch` は起動時に1回コンパイルする。それでも外せないのは、`--parallel` が依存順序を無視して両者を同時に起動するため、生成物が無い状態では Vite が先に到達して `Failed to resolve import` を返しうるからである。冗長に見えるが消すとクリーン後の初回 dev で必ず踏む。

ウォッチャだけ動かしたいときは `vp run client#dev`。

なお `concurrently` で組む形も採れるが、依存が増える上に `vp run` を子に置けない——stdio がパイプされた状態で Rust の `vp run` が spawn に失敗し `os error 22 (Invalid argument)` で落ちる（`playwright.config.ts` が `vp exec` を使っているのと同じ罠）。`vp run --parallel` ならこれを踏まず、リポジトリ全体が `vp` で揃う。引き換えに失うのは per-line の `[messages]` / `[server]` プレフィックスだけである。

### テストのロケールは3層とも明示的に固定する

| 層               | 手段                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| node             | 固定不要（`navigator` が無く `baseLocale` に落ちる）。`describeSlidesMeta` の期待値は `m` 同士で比較するので、そもそもロケールに依らない |
| browser (vitest) | `vitest-setup.browser.ts` の `overwriteGetLocale(() => 'en')`                                                                            |
| e2e (Playwright) | `playwright.config.ts` の `use: { locale: 'en-US' }`                                                                                     |

e2e は**移行前から穴だった**——`getByRole('listbox', { name: 'Slides' })` のように英語文言に依存しながらロケールを固定しておらず、Chromium の既定がたまたま en-US だから通っていた。明示に変えた。この層だけが本番と同じ `preferredLanguage` 解決を通るので、`overwriteGetLocale` で経路を差し替える browser 層の穴をここが埋める。

browser 層で `<I18nProvider locale="en-US">` を各 render に巻く形は使えなくなった。Paraglide のロケールは React context ではなくモジュール状態なので、サブツリーにスコープできない。

### 失われた型保証はテストで張り直す

`src/__tests__/messageCatalogs.test.ts` が (1) 宣言された `locales` を全部カバーしているか、(2) 全ロケールが同じキーを持つか、(3) 全ロケールが同じプレースホルダを取るか、を検証する。(3) が要るのは、キーが揃っていても翻訳が `{path}` を落とせばパスの入らない文が出るため。

### `describeSlidesMeta` の `format` 引数を落とす

React 非依存モジュールを node テストするための注入 seam だったが、Paraglide のメッセージは React 非依存の素の関数なので直接 import できる。テストは文言をハードコードせず `m.no_pdf_yet_hint()`（このキーは ADR-0019 で `slides_missing_hint` に統合された）のように**メッセージ関数同士で比較**する——一見トートロジーだが、検証しているのは「どのキーを選んだか」で、旧スタブと同じ検証力を持ちつつ文言変更で壊れない（§8.1 N3 の「コピーはテスト対象外」を維持）。プレースホルダ補間だけは別ケースで、異なる path が異なる文になることを見る。

### キーは snake_case で、doc コメントの情報を名前に吸収させる

`titleLabel` → `title_field_label`、`infoNoSlides` → `no_pdf_yet_hint`（`hint` が「エラーではなく正常状態の案内」という判断を担い、当時 `describeSlidesMeta` が返していた `tone: 'hint'` とも揃う。`tone` は ADR-0019 で不要になり削除されたが、キー名が判断を担うという原則自体は後継の `slides_missing_hint` にも生きている）、`overflowLabel` → `slide_beyond_pdf_pages_label` など。

`Workspace.tsx` のテーマ選択肢テーブルは、キー文字列ではなく**メッセージ関数そのもの**を持つ（`label: m.theme_option_system`）。`m[key]()` という動的アクセスは木揺すりを殺す。

## Considered Options

- **移行しない**: 却下されたが、検討に値した。動機2が部分的にしか達成されないと判明した時点で、動機1だけなら `useMessages.ts` が RAC から借りている `useLocale` を自前の `navigator.languages` 読み取りに差し替えるだけで済む。それでも進めたのは、キャストと型パズルの除去、外部ツールが読めるメッセージ形式、木揺すり可能な出力を合わせて採る判断。
- **メッセージ関数を薄くラップして型と doc コメントを戻す**: 却下。`export const slideImageAlt = (n: number) => m.slide_image_alt({ n })` を17個書けば引数型も doc コメントも戻るが、「継ぎ目を消す」という動機に対して新しい層を1枚足すことになる。
- **生成物を commit する**: 却下。45ファイルの生成物が diff に乗り続け、`messages/*.json` との古びを `compile && git diff --exit-code` で別途封じる必要がある。`prepare` は install と publish の両方で走るので、gitignore 側にその手当てが要らない。
- **ICU MessageFormat プラグインを使う**: 却下。引数型は結局 `NonNullable<unknown>` のままで、得るものが無い。
- **`@inlang/paraglide-js-react` を導入する**: 却下。メッセージ内マークアップ用のパッケージで、17メッセージは全てプレーンテキストなので `ParaglideMessage` は `message()` にフォールバックするだけ。しかも ReactNode を返すため、`aria-label` / `alt` / `document.title` など文字列必須の11箇所では使えない。マークアップ入りメッセージが実際に必要になった時点で入れる。

## Consequences

- **引数の型が緩くなった。** `m.slide_image_alt({ n: "banana" })` が型チェックを通る。実際に引数を取るメッセージは5つで、渡す値はいずれも周囲の型（`number` のスライド番号、`string` の path）で守られているという判断。
- **翻訳漏れがコンパイルエラーでなくなった。** 網は `messageCatalogs.test.ts` に移った。型注釈と違い、テストを走らせるまで分からない。
- **各メッセージの doc コメント17個を失った。** 「`saveError` は編集自体は画面に残っており、失われたのは保存だけ」のような判断は、キー名にどうやっても入らない。標準 JSON にコメントは書けず、inlang message format に description フィールドも無い（`$schema` のみ）。
- **ブラウザの言語設定を変えても即座には反映されない。** 移行前は `languagechange` で再レンダーしていた。次回読み込みまで待つことになる。
- **ADR-0015 の動機2は部分的に取り消される。** 「ロケール解決を RAC に完全に委ね、アプリ側にロケール解決コードが1行も要らない」は、`main.tsx` にロケールを読む2行が復活したことで成り立たなくなった。ただし ADR-0015 が同時に警戒していた「`react-aria` を直接依存にすると `I18nContext` が2コピー入り、ロケール解決が静かにずれる」問題は、依存の向きが反転したことで**構造的に消えた**——今は `I18nProvider` に値を渡す側なので、RAC がどのコピーの context を読もうと、こちらのメッセージには影響しない。
- **`plans/react-rewrite-spec.md` §6 は本 ADR が上書きする。** §6.5 / §6.6 が検討していた `useLocalizedStringFormatter` への移行経路、および §8.6 の `<I18nProvider locale="en-US">` によるテスト固定は、いずれも失効した。
- **依存の増減**: `@internationalized/string` を落とし、`@inlang/paraglide-js` を client の devDependency に足す。実行時依存は増えない（生成コードは self-contained）。
- **`packages/client` に初めて生成ステップが入った。** `vp install` を走らせずに clone 直後のツリーを型チェックすると `src/lib/paraglide` が無くて落ちる。CLAUDE.md の Review Checklist が既に「`vp install` を最初に走らせる」と言っているので、新しい手順ではない。
