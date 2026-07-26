# 素の Vite + React を UI 層に採用し、ルーティングは起動時の hash 読み1回にする

Supersedes: ADR-0007

client を SvelteKit + Svelte から **素の Vite + `@vitejs/plugin-react` + React** に書き直す。メタフレームワークは入れず、ルータライブラリも入れない。2つのページ（ワークスペース / スライドショー）は `packages/client/index.html` 1枚と `src/main.tsx` 1本に集約し、起動時に `location.hash` を1度だけ読んで `React.lazy` で分岐先チャンクを選ぶ。CLI が `configFile: false` のインライン設定で Vite を全所有するという ADR-0007 の原則は**器のまま維持し、中身だけ置換する**。

## 動機

SvelteKit の実利用範囲は「2ルートの出し分け」「`$lib` エイリアス」「静的出力」の3つだけで、いずれもフレームワークなしで代替できる（調査 [#16](https://github.com/yuheiy/note-first-presenter/issues/16)）。React 側でこの3つを買い直す候補はどちらも成立しなかった。

- **React Router framework mode**: 設定ファイル規約（`react-router.config.ts` + `routes.ts`）が ADR-0007 の「`configFile: false` のインライン設定が唯一の正本」と衝突する。
- **TanStack Start**: 1.0 未満。

残る「2ルートの出し分け」は、このアプリでは**ルーティングと呼ぶほどのものではない**。スライドショーは常に `target="nfp-slideshow"` で別ウィンドウに開かれ、戻る導線もないので、2ページが1つのドキュメント内で行き来することがない。したがって必要なのは起動時に1度ページを選ぶことだけで、履歴連携もルート遷移も要らない。

## 設計決定

### ルーティング: 1 HTML + hash

| ページ         | URL              |
| -------------- | ---------------- |
| ワークスペース | `/#/3`           |
| スライドショー | `/#/slideshow/3` |

- URL 形式は **Slidev の hash モードに倣った**（番号だけのルートを主役のワークスペースに、名前 + 番号を副次ビューに割り当てる）。
- ハッシュが空の `/` は起動時に `history.replaceState` で `/#/1` へ正規化する（`location.replace` と違い履歴エントリを増やさない）。
- **`hashchange` リスナは置かない。** スライドショー窓は BroadcastChannel で既に追従しており、URL を第二の入力経路にする理由がない。
- スライドショーへのリンクは ``href={`#/slideshow/${activeSlide}`}`` + `target="nfp-slideshow"`。ハッシュのみの相対 URL なのでパスを含まず、サブディレクトリ配下でもそのまま動く。 — **取り消し済み（2026-07-26 の追記を見よ）: 事実誤認だった。**
- **hash はサーバに届かない**ので、静的配信の SPA フォールバック問題（ADR-0007 の `200.html`）そのものが消滅する。 — **破棄済み（2026-07-26 の追記を見よ）: この一文を根拠に何かを却下してはならない。結論だけは別の根拠で生きている。**

### CLI 統合（`createViteConfig`）は器を維持して中身を置換する

| ADR-0007                          | 本 ADR                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `sveltekit()` + `adapterStatic()` | `react()`                                                           |
| `appType: 'mpa'` 相当の構成       | `appType` は既定（`'spa'`）、`build.rollupOptions.input` の指定なし |
| `200.html` フォールバック         | 消滅（hash ルーティングの帰結）                                     |
| adapter の `builder.rimraf`       | `build.emptyOutDir`（`outDir` が `root` の外にあるので明示が必要）  |

`dev.ts`（createServer）/ `build.ts`（viteBuild + `nfp-data/` 後置き）の流れと `ViteNfpPlugin` は無変更。dev では middleware が `/nfp-data/*` を先に処理し、それ以外は SPA フォールバックで `index.html` を返す。

### 実アプリに効かせたい Vite プラグインは `createViteConfig` に追加する

ADR-0007 の追記（2026-06-13）で決めたこの規則を**本 ADR が引き取る**。dev/build を担うのは CLI の `createViteConfig` であり、`packages/client/vite.config.ts` はテスト/IDE 専用である——この非対称は SvelteKit の有無と無関係に残るので、React 構成でもそのまま有効である。0007 の追記はこの規則の実例として ADR-0009（Tailwind v4）の `tailwindcss()` を名指ししており、**0009 の配線が正しい理由はこの規則の側にしか書かれていない**（0009 本文は `source('..')` と `@theme` の話だけで、プラグインの置き場には触れていない）。0014 が引き取らないと、その根拠が superseded になった ADR にしか無い状態になる。

`@vitejs/plugin-react` と `@tailwindcss/vite` はどちらも CLI の `dependencies` に宣言し、client の `vite.config.ts` にもテスト一貫性のため同じものを並べる（正本は CLI 側）。

### `$lib` の後継はエイリアスなし

相対 import に統一する。ADR-0007 が置き換えた ADR-0006 の subpath imports（`#lib/*`）も**復活させない**。エイリアスが解く問題（読めないほど深い `../../../..`）が現に発生しておらず、エイリアスを1つ足すたびに tsconfig と Vite の2箇所（ADR-0006 が一本化しようとした重複そのもの）が戻ってくる。

### エントリと HTML

- `packages/client/index.html` 1枚（Vite の root 規約）。SvelteKit は `src/app.html` を自力で見つけていたが、素の Vite は `root` 直下の `index.html` しか探さない。client `package.json` の `files` に `index.html` を足さないと公開パッケージが壊れる。
- テーマ初期化スニペット（FOUC 回避のインラインスクリプト、ADR-0009）は `index.html` に置く。複製先（`200.html`）が消えたので共有注入機構は要らない。
- **db / slides meta の fetch は `main.tsx` で前倒し発火する。** チャンク DL と通信が並列になり、副次効果として StrictMode の effect 二重実行による二重 fetch も起きなくなる。

### Editor / Viewer の分岐は `import.meta.env.DEV`

ADR-0007 の判断を維持し、ADR-0001 の define 定数（`__NFP_STATIC__`）は再導入しない。URL 空間を `/nfp-data/*` に統一した（ADR-0013 と同じ準備フェーズ）ことで、`import.meta.env.DEV` の意味は「書き込めるか / 読むだけか」の1軸だけに減っている。

### `<StrictMode>` は有効

Vite の React テンプレートの既定に従う。Outliner での実害はなく（ProseMirror の生成/破棄は `useEffect` の cleanup で対称）、逆に「マウント effect の依存に `initialOutline` や `onChange` が漏れて打鍵ごとにエディタが再生成される」類のバグを開発中に暴き続ける。

## ADR-0001 との関係

**本 ADR は実質 ADR-0001 の立場への回帰である。** 0001 は「メタフレームワークを使わず、CLI がサーバと Vite を全所有する」と決め、0007 がそれを superseded にした。0007 が SvelteKit から買おうとしたのは file-based routing と `$lib` の2つだが、**そのどちらも本アプリには不要だった**というのが本 ADR の判断である。将来の読者が 0001 ↔ 0007 ↔ 0014 のチェーンを往復しないよう、差分を明記しておく。

| 論点                  | ADR-0001                                 | ADR-0007              | 本 ADR                                |
| --------------------- | ---------------------------------------- | --------------------- | ------------------------------------- |
| メタフレームワーク    | なし                                     | SvelteKit             | なし                                  |
| ルーティング          | `location.pathname` + SPA フォールバック | file-based            | `location.hash`（フォールバック不要） |
| エイリアス            | subpath imports（ADR-0006）              | `$lib`                | なし（相対 import）                   |
| モード切替            | define 定数 `__NFP_STATIC__`             | `import.meta.env.DEV` | `import.meta.env.DEV`（0007 を維持）  |
| Vite / サーバの所有者 | CLI                                      | CLI                   | CLI                                   |

0001 から素直に持ち越さなかったのは**モード切替だけ**で、これは 0007 の判断のほうが良いのでそちらを維持している。

## Considered Options

- **React Router framework mode**: 却下。設定ファイル規約が「インライン設定が唯一の正本」と衝突する（§動機）。
- **TanStack Start**: 却下。1.0 未満。
- **ルータライブラリだけ入れる（react-router の declarative mode 等）**: 却下。2ページ間の遷移が存在しない以上、ルータが解く問題（マッチング・履歴・遷移）が1つも発生しない。
- **MPA 2エントリ（`index.html` + `slideshow/index.html`）**: 却下。`build.rollupOptions.input` と `appType: 'mpa'` を CLI 側に書くことになり、静的配信でもディレクトリ構造への依存が残る。hash なら1枚で足りる。
- **ADR-0001 の pathname ルーティングにそのまま戻る**: 却下。`200.html` フォールバックの手当てが復活し、サブディレクトリ配下での配信も壊れる。hash はそのどちらも構造的に消す。
- **Svelte のまま React Aria 相当を探す / Svelte と React を一時共存させる**: 却下。前者は本書き直しの前提そのものを覆す。後者は捨てるための相互マウント配線を書くことになる。

## Consequences

- **`svelte.config.js` が消え、knip の SvelteKit プラグイン検出という前提も消えた。** 0007 の追記（2026-06-12）はこのファイルを「knip 検出専用に空のまま維持する」と決めていたが、自動提供されていた3つ（ルートの entry パターン / `$lib` 解決 / `$app`・`$env` の ignore）は React 構成では全て不要である。`knip.json` の client 側に残るのは `project` と `ignoreDependencies` だけで、**`entry` は1行も書かない**。エントリは3経路すべてが同じ `src/main.tsx` を指すので手書きが要らない — knip の既定パターン（`src/main.*`）、Vite プラグイン（`index.html` の `<script src>` を読む）、Vitest プラグイン（`vite.config.ts` の `test` 設定からテストファイルと `setupFiles` を拾う）。`entry: ["src/main.tsx"]` と書くと knip 自身が "Remove redundant entry pattern" と警告する。**代わりに knip が本来の仕事をするようになった** — 旧設定の `entry: ["src/**/*.svelte"]` は全コンポーネントをエントリ扱いにしており、未使用コンポーネントを1つも検出できていなかった。到達不能なファイルと未使用の export が実際に報告されることは、それぞれプローブを1本置いて確認した。
- **`pnpm-workspace.yaml` の `overrides.typescript` と `peerDependencyRules.allowedVersions.typescript` を削除した。** どちらも `@sveltejs/kit` が `typescript ^5||^6` を peer に要求することへの対処だった。kit 撤去後に typescript を peer に持つのは `valibot` と vite-plus 系だけで、いずれも catalog の `^7.0.2` を受け入れる（override を外しても解決は 7.0.2 のまま）。
- **`.gitignore` の `.svelte-kit` 節を削除した。** `packages/client/tsconfig.json` は R1 で自前に書き起こし済みで、`.svelte-kit/tsconfig.json` への `extends` は無い。
- **型検査は `vp check`（tsgolint）一本のまま。** `svelte-check` は #37 で先に落としており（0007 の追記 2026-07-26）、`tsc --noEmit` も per-package の `check` スクリプトも足さない。`lint.options` の `typeAware: true, typeCheck: true` が `.tsx` を型検査する。Oxlint には `react` プラグインを追加した（`plugins` は既定セットを上書きするので既定ごと明示が必要。`jsx-a11y` と `react-perf` は不採用）。
- **エージェント向け設定を React 系に入れ替えた。** `.mcp.json` の `ark-ui` を `react-aria` に差し替え、`.claude/settings.json`（Svelte プラグイン有効化の1行のみ）と `packages/client/CLAUDE.md`（Svelte MCP の使い方）を削除した。
- **i18n: inlang / Paraglide を廃止し `@internationalized/string` に置き換えた。** 独立した ADR を起こさないのは、この決定が React 土台の選択に従属するため（Paraglide を外すと `paraglideVitePlugin` も落ち、置換先は RAC が同梱する `useLocale` に乗るので、本 ADR が言う「Vite プラグインを1つも増やさない」構成の一部になる）と、そもそも既存の i18n ADR が無いためである。機構は Adobe Spectrum 2 と同じ `LocalizedStringDictionary` + `LocalizedStringFormatter` だが、S2 の ICU JSON + コンパイラは Parcel 固有なので採らず、`src/lib/intlMessages.ts` に TS 辞書として持つ（18件、うちパラメータ付き5件は関数リテラル、翻訳者向け説明は JSDoc）。辞書キーは `'en'` / `'ja'` ではなく **`'en-US'` / `'ja-JP'`**（`getStringsForLocale` の最終フォールバックが `strings['en-US']` を返すので、キーを短くすると `fr-FR` のブラウザで TypeError になる）。ロケール解決コードは1行も書かず、`I18nProvider` をアプリに置かないまま RAC の `useLocale()` → `navigator.language` に委ねる（`I18nProvider` を使うのはテストでのロケール固定だけ）。`<html dir="ltr">` は静的に書き、`lang` だけをカタログの `htmlLang` から `useEffect` で設定する——ブラウザのロケールではなく**表示中のカタログの言語**を書くのが `lang` の役割だからで、2ロケールしか持たないこのアプリでは `fr-FR` のブラウザが通常のケースとして発生する。
- **`packages/client/.svelte-kit/` の残骸は R1 で削除した。** 残しておくと古い `extends` がそこを解決し続け「型検査が通っている」偽陽性を生む。
- ページ分割は `React.lazy` が担うので、スライドショー窓は Workspace 側（ProseMirror 等）のチャンクを読み込まない。ADR-0008 の HMR live-reload 経路も、ADR-0012 の `Slides` 抽象も、この変更の影響を受けない。
- **ADR-0007 は本決定により superseded となる。** 0007 の判断のうち生き残るもの（`configFile: false` のインライン設定が唯一の正本 / API は `ViteNfpPlugin` に残す / モード切替は `import.meta.env.DEV` / 実アプリ向けプラグインは `createViteConfig` へ）は本 ADR が明示的に引き取っている。0007 の追記3本のうち、2026-06-12（`svelte.config.js` を knip 検出用に残す）は撤回、2026-06-13（プラグインの配線先）は上記のとおり引き取り、2026-07-26（`svelte-check` 撤去）は経緯の記録として 0007 に残す。

## 追記（2026-07-26）: ルーティングの判断は ADR-0017 が引き取った

**本 ADR のタイトルにある「ルーティングは起動時の hash 読み1回にする」のうち、"hash" だけが取り消された。** URL の形に関する判断は [ADR-0017](./0017-router-mode-and-base-without-a-router.md) が置き換えている。「起動時に1回読む」の方は生きている。

| 本 ADR                                                   | ADR-0017                                   |
| -------------------------------------------------------- | ------------------------------------------ |
| hash 固定                                                | `routerMode`（既定 `history`）             |
| スライド番号は hash のパス（`#/3`、`#/slideshow/3`）     | `?slide=` の search param。スライド1は無印 |
| `200.html` は構造的に消滅                                | `404.html` を無条件で出力                  |
| サブディレクトリはハッシュ相対で解決（下記のとおり誤り） | `base` オプション                          |

**維持されるもの**: ルータライブラリを入れないこと、リスナを置かないこと、URL は書き込み専用のミラーであること、起動時に1度だけ URL を読んでページを選ぶこと。0017 の作業では一度 wouter を入れて完成させたうえで剥がしており、その経緯は 0017 の §ルータライブラリを入れない に記録してある。本 ADR の「2ページ間の遷移が存在しない以上、ルータが解く問題が1つも発生しない」という判断は、スライド番号がパスから外れたことで**当時より強くなっている**。

本 ADR のそれ以外の判断は有効なままで、superseded にはしない — メタフレームワークを使わないこと、`configFile: false` のインライン設定が唯一の正本であること、実アプリに効かせたい Vite プラグインは `createViteConfig` に置くこと（`define` の追加もこの規則に従っている）、`$lib` の後継はエイリアスなしであること、モード切替は `import.meta.env.DEV` であること、`<StrictMode>` を有効にすること。`packages/client/vite.config.ts` がテスト/IDE 専用であるという非対称も生きており、0017 の `__NFP_ROUTER_MODE__` はその非対称にそのまま乗っている。

### §ルーティングの箇条書きのうち2つを取り消す

**「ハッシュのみの相対 URL なのでサブディレクトリ配下でもそのまま動く」は事実誤認だった。** 成立していたのはリンクについてだけで、ビルド成果物の `<script src="/assets/…">` も `/nfp-data/*` も origin 絶対だったので、サブディレクトリに置いたサイトは当時から全体が壊れていた。ADR-0017 の `base` オプションはこの穴を初めて塞ぐものでもある。

**「hash はサーバに届かない」は破棄する。** ADR-0017 が `?slide=` を実クエリに置いたので、hash モードでもスライド番号はサーバに届く。ただし破棄の理由は「成り立たなくなったから」ではない — **この性質を守るべきものとして持ち歩くのをやめた**からである。クエリがクエリとして扱われること（`location.search` で読める、DevTools とサーバログに現れる）の方を優先した。今後この一文を根拠に何かを却下してはならない。判断の全文は ADR-0017 の §ADR-0014 の「hash はサーバに届かない」を破棄する にある。

**同じ箇条書きの結論（`200.html` が要らない）は生きている。** ただし根拠は上の一文ではなく、**ルートがリクエストに含まれない**という狭い事実の方である。`GET /?slide=3` も `GET /` も返るべき文書は `index.html` 1枚しかない。hash モードが base を知らずにサブディレクトリで動くのも同じ理由による。
