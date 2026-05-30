# client / server リアーキテクチャ設計ドキュメント

SvelteKit を撤去して client を純 Svelte SPA 化し、Node/サーバ/Vite を CLI（`note-first-presenter`）に集約することで、`packages/note-first-presenter`（CLI）と `packages/client` の責務分担の曖昧さを解消する。

関連: [[2026-05-26-note-first-presenter-design]]（MVP 設計）、[[2026-05-30-build-export-design]]（build/export）。本ドキュメントはそれらの後継リアーキテクチャ。

## 1. 目的とスコープ

### 1.1 解決する問題

CLI と client のどちらにも同じ実装ができてしまい、責務分担が曖昧。具体的症状:

- **① 仮想モジュール契約の二重実装**: `virtual:nfp/runtime-config` / `virtual:nfp/mode` を dev は `note-first-presenter/src/plugin/index.ts`、build は `client/vite.config.ts` の `nfpBuildVirtualModules` で別々に実装。
- **② 型の複製**: `SlidesStatus` が `resolve-slides-path.ts` / `pipeline/build-data.ts` / `client/src/app.d.ts` に、`NoteFirstPresenterConfig` が `config/schema.ts` と `app.d.ts` に重複。
- **③ CLI が client の `src/*.ts` にサブパス侵入**: `build.ts`/`export.ts` が `@note-first-presenter/client/pipeline/*`（生 `.ts`）を import し、`vp pack` の `alwaysBundle: /^@note-first-presenter\/client/` ハックを要する。
- **④ 契約が宙に浮く・逆依存が暗黙**: client は `note-first-presenter` を宣言依存していないのに、`runtimeConfig` 形・`virtual:nfp/*` 契約・`NFP_*` env を消費し build 時プラグインまで再実装。
- **⑤ `virtual:nfp/mode` の再実装**（①の一部）。
- **⑥ サーバ責務がドメインでなくビルドフェーズで二分**: 同じドメイン操作（DB 読み・PDF 全描画）が、dev は client の SvelteKit API ルート、build/export は CLI が直接 pipeline 呼び出し、と所属パッケージも設定の渡し方も分かれる。

根本原因は、ドメイン中核（`lib/server`・`lib/pipeline`）が物理的に client に間借りしつつ、所有と呼び出しが CLI と client に二分され、契約がどちらのパッケージにも属さないこと。さらに **SvelteKit が「バンドル内サーバー（`+server.ts`）」を所有している**ことが、サーバ責務の二分と仮想モジュール注入の二重化を構造的に強制している。

### 1.2 アプローチ

Slidev の構成（[§3](#3-slidev-からの知見)）を参考に、**SvelteKit を撤去**して以下を実現する:

- **2 パッケージ・共有コードゼロ**。依存は `cli → client` の一方向のみ（client は上流に依存しない純フロント）。
- Node/サーバ/Vite/仮想モジュールを**すべて CLI が所有**。client は CLI 提供の API ミドルウェアを fetch するだけの純 Svelte SPA。
- client と CLI は境界をまたぐ JSON について**それぞれ自前の型**を持つ（ワイヤ契約のみ共有、コードは共有しない）。

### 1.3 含まないもの（YAGNI / 非ゴール）

- **マルチデバイス同期 / SSE / WebSocket / server-ref**: 単一ユーザのローカルツールなので不要。db は単純な GET/PUT で十分。
- **SSR / プリレンダリング**: 単一 index.html の SPA とし、初期表示は JS 実行までブランクで許容（JS 必須の対話ツール）。
- **共有 `core` / `types` パッケージ**: ブラウザはサーバドメイン（pdf/pipeline）を実行時に使わないため、下層に切り出す共有物が無い（[§9.1](#91-却下-core--types-パッケージ)）。
- **client → cli の型 import / 依存方向反転**（[§9.2](#92-却下-cli-が-client-向けに型を-export)）。
- **hash ルーティング / クライアントルータ / 属性ベースルーティング**（[§9.3](#93-却下-hash--属性ベースルーティング)）。
- PPTX 対応、マルチプレゼンテーション、キャッシュ GC、言語切替 UI。

## 2. 目標アーキテクチャ

### 2.1 パッケージ構成（一方向 DAG）

```
@note-first-presenter/client  ← 純 Svelte SPA。UI のみ。境界は JSON を fetch するだけ。上流に依存しない
   ↑
note-first-presenter (cli)    ← Node 全部: config 読込 / サーバミドルウェア / pdf・db・pipeline / Vite config / 仮想モジュール
```

| パッケージ | 責務                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **client** | UI 全部（`outliner/*`・`slide-*`・`slides-meta`・`sync`・`theme`・`active-slide`・stores・`*.svelte`）、`runtime-mode.ts`、`server-client.ts`、文書モデル `db/schema`。**サーバコード・Vite config・SvelteKit を持たない**                          |
| **cli**    | CLI（citty）、config 読込＋スキーマ、slides 解決、`startServer`/`runBuild`/`runExport`、**サーバドメイン**（pdf-renderer・db-io・slide-cache・pipeline を `src/node/` 配下に）、**Vite config 一元所有**、API ミドルウェア、仮想モジュール、watcher |

### 2.2 責務分担の原則

将来「どちらにも書ける」を裁く基準（3 層アダプタモデル）:

- **FS / PDF / DB に触るが HTTP / Vite / Svelte に触らない** → CLI（`src/node/`）
- **argv 解析・Vite 起動・サーバミドルウェア** → CLI
- **HTTP リクエスト処理・UI 描画** → client

> ネットワーク境界をまたいでコードは共有しない。共有するのはワイヤ形式（JSON）だけで、**各側が自分用の型を持つ**。

## 3. Slidev からの知見

Slidev（`@slidev/cli` / `@slidev/client` / `@slidev/parser` / `@slidev/types`）の調査結果。

- **依存は厳密に一方向** `types ← parser ← client ← cli`。**client は CLI に一切依存しない**。
- **仮想モジュールは全部 CLI が所有・単一実装**（`node/virtual/*`）。client は `#slidev/configs` 等を import するだけ。serve / build で同じテンプレートを共用。
- **`mode` は Vite `define` 定数 `__DEV__`**（`client/env.ts` の `mode = __DEV__ ? 'dev' : 'build'`）。1 か所で設定。
- **REST API は実質存在しない**。データ性質ごとに 3 機構: 初期データ＝仮想モジュール、可変状態＝`vite-plugin-vue-server-ref`（WebSocket 同期）、稀な書き込み＝`configureServer` + WS メッセージ。dev サーバ（`commands/serve.ts`）は `createViteServer` を呼ぶだけ。
- `@slidev/types` を分けるのは第三者 publish（テーマ/アドオン）のため。`@slidev/parser` を分けるのは**ブラウザが Markdown パースを実行時に必要**とするため。

**nfp が採るもの**: 「素の Vite + CLI がサーバを所有、メタフレームワーク無し」という設計姿勢、書き込みの検証ガード、仮想モジュールと mode define の CLI 一元管理。
**nfp が採らないもの**: server-ref（マルチデバイス不要）、data の仮想モジュール化（[§5.1](#51-slides-meta-はミドルウェアのまま)）、types/parser の分離（nfp はブラウザがサーバドメインを使わない＝切り出す共有物が無い）。

## 4. API 設計

SvelteKit の `routes/api/*/+server.ts` 3 枚を、**CLI 所有の Vite `configureServer` ミドルウェア**へ移す。サーバ設定（`dbPath` / `cacheRoot` / `slidesStatus`）は仮想モジュール注入をやめ、**ミドルウェアのクロージャ引数**で渡す（→ `virtual:nfp/runtime-config` 廃止）。

| ルート                | メソッド  | 処理                                                                                                        |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `/api/slide/:hash/:n` | GET       | pdf-renderer で webp 描画・キャッシュ。バイナリ・オンデマンドなので**唯一不可避の本物 HTTP ルート**         |
| `/api/slides/meta`    | GET       | PDF の hash + pageCount。失敗状態（`configured-but-missing` 等）は 422 + body                               |
| `/api/db`             | GET / PUT | outline db の読み/書き。PUT は**サーバ自前の valibot スキーマで入力検証**後 `.note-first-presenter.json` へ |

- **server-ref は使わない**（単一デバイス）。db は単純な GET/PUT。client はデバウンス保存で PUT。
- 静的モードは read-only: client は `/nfp-data/*` を fetch（`runtime-mode.ts` の URL 抽象は不変）、保存は無効。
- ミドルウェアは SPA フォールバックより**前**に順序付け（`/api/*` が index.html に飲まれないように）。

## 5. 仮想モジュール / mode

- `virtual:nfp/runtime-config`（サーバ FS パス）→ **廃止**。サーバはミドルウェアのクロージャで受け取る。
- `virtual:nfp/mode`（`isStatic`）→ **Vite `define` 定数 `__NFP_STATIC__`** に置換。CLI の Vite config が dev=false / build=true を 1 か所で設定。`runtime-mode.ts` がこれを読む。
- → 仮想モジュールの dev/build 二重実装（症状①⑤）が、**Vite config の CLI 一元所有**により構造的に消滅。

### 5.1 slides-meta はミドルウェアのまま

Slidev 流に slides-meta を仮想モジュール化する案は**不採用**。理由: nfp の meta は失敗状態を 422 + body で返す HTTP セマンティクスが要り、かつ静的モードで同じデータを `/nfp-data/meta.json` として fetch する二重性がある。仮想モジュール（import 値）ではこの両方を表現できず `metaUrl()` 抽象も崩れる。Slidev の config は常在のコンパイル時データなので事情が違う。

## 6. ルーティング

- **単一 `index.html` を全ルートで使い回す**（SPA フォールバック）。
- **マウント時に `location.pathname` を 1 回読んで分岐**。`App.svelte`/`main.ts` が `Presenter` / `Slideshow` を出し分け。リアクティブ location も popstate も router も不要。
  ```ts
  const Page = location.pathname.startsWith('/slideshow') ? Slideshow : Presenter;
  ```
- **ページ遷移は素の `<a href="/slideshow">` / `<a href="/">`**（フルリロード）。pushState もリンクインターセプトも無し。ブラウザ戻る/進むも通常リロードで動く。
- **History API はスライド位置 `?slide=N` のみ**: `active-slide-store` の読み＝`location.search`、書き＝`history.replaceState`（非遷移・履歴を汚さない）。

### 6.1 SPA フォールバック（唯一の運用要件）

- dev: Vite `appType: 'spa'` が `/slideshow` に index.html を自動フォールバック。
- 静的ビルド: build 後に **index.html を `200.html` へコピー**（CLI の build 後処理で出力）。

## 7. i18n（paraglide ブラウザ化）

- **paraglide は strategy 無改修でブラウザ動作**。`runtime.js` の `getLocale()` は `!isServer` 分岐で `preferredLanguage → navigator.languages` → `baseLocale`(en) を解決。`m.*()` は無改修で動く。
- `hooks.server.ts`（唯一の SvelteKit 依存 i18n コード）→ **削除**。
- `<html lang/dir>` の注入（旧 `transformPageChunk`）→ **マウント時にクライアントで設定**: `document.documentElement.lang = getLocale(); document.documentElement.dir = getTextDirection()`。
- `index.html`（旧 `app.html`）: `%paraglide.lang%`/`%paraglide.dir%` → 静的初期値 `lang="en"`（dir 省略=ltr）。
- paraglide Vite プラグインは CLI の Vite config へ移設（`project`/`outdir` は clientRoot 相対）。inlang プロジェクトと messages は client に残す。
- **FOUC は実質ゼロ**: en/ja とも LTR で dir 不変。むしろ現状の adapter-static は prerender 時 en で焼き hydration で ja に化ける既存 flash があり、SPA 化はこれを解消する。

## 8. ビルド

- adapter-static / adapter-auto / prerender を**廃止**。`svelte.config.js` は adapter 分岐を捨て preprocess のみ（または CLI の plugin options へ畳む）。
- CLI が `vite build`（`build.outDir` = ユーザ指定）→ 単一 `index.html` + `assets/*`。続けて従来通り `nfp-data/`（db.json / meta.json / slides/&lt;hash&gt;/NNNN.webp）を書き出し、さらに `index.html → 200.html` コピー。
- `NFP_STATIC` env と `svelte.config.js` の分岐は廃止 → `__NFP_STATIC__` define に統一。`runtime-mode.ts` の `/nfp-data/*` fetch は不変。

## 9. db 契約

- **db の形（`DbV1` 型・`defaultDb`・valibot スキーマ）は client 専有**の文書モデル。
- サーバは db を**不透明 JSON として永続化**し、PUT は**サーバ自前のスキーマ**で入力検証（信頼境界のガード。client の内部モデルには依存しない）。
- 重なるワイヤ表面は `{ version, title }` のみ（`outline` は `v.unknown()` でサーバは中身に無関心）。2 定義のコストもドリフトの実体もほぼ無く、将来 outline 構造を変えてもサーバは無改修。
- ENOENT 時のデフォルト文書は client が供給（サーバは 404/`null` を返す）か、サーバが自前の空デフォルトを返すかの小さな選択（実装計画で確定）。

## 10. 影響ファイル（想定）

**client（削除）**: `src/hooks.server.ts`、`src/routes/api/**`、`src/routes/+layout.ts`、`src/vite.config.ts`、`src/lib/server/**`、`src/lib/pipeline/**`（CLI へ移設）。
**client（変更/新規）**: `index.html`（新）、`src/main.ts`（新）、`src/App.svelte`（新）、`routes/+page.svelte`→`Presenter.svelte`、`routes/slideshow/+page.svelte`→`Slideshow.svelte`、`app.html`→`index.html` へ統合、`src/app.d.ts`（仮想モジュール型整理）、`active-slide-store.svelte.ts`（`$app/*`→location+History）、`runtime-mode.ts`（`__NFP_STATIC__`）、`svelte.config.js`（preprocess のみ）、`package.json`（依存整理）。
**cli（新規/変更）**: `src/node/`（pdf-renderer・db-io・slide-cache・pipeline 移設先）、`src/vite/`（Vite config 構築・仮想モジュール・API ミドルウェア・watcher）、`server.ts`/`build.ts`/`export.ts`（cli 内部参照へ）、`index.ts`、`package.json`（client pipeline サブパス依存と `alwaysBundle` 撤去、必要依存の移設）。

## 11. テスト / 検証

- 既存ユニットテスト（pdf-renderer / db-io / pipeline / outliner）は移設先で維持。
- e2e（`e2e/`）は CLI 起動の結合テストなので、dev サーバ + ミドルウェア + SPA で緑を維持。
- 各フェーズ末で `vp check` / `vp test` / `playwright test`、および dev 起動・静的 build の手動確認。

## 12. 却下した代替案（再検討防止のため記録）

### 9.1 却下: core / types パッケージ

重い `core`（pdf/pipeline）は不要。Phase で client の API ルートを消すとサーバドメインの消費者は CLI 単一になり、パッケージでなく CLI 内フォルダで足りる。共有 `types` も不要: ブラウザが実消費する共有はワイヤ型と僅かな関数のみで、各側が自前定義すれば済む（重なりが `{version,title}` 程度）。Slidev が types/parser を分けるのは第三者 publish とブラウザがパーサを使うためで、nfp には両制約が無い。

### 9.2 却下: CLI が client 向けに型を export

client が cli から型を import する案は、`cli → client`（peerDep）に対し `client → cli` を足して**循環**になり、「client は純フロントで上流に依存しない」不変条件を壊す。依存方向反転も非採用。各側が自前ワイヤ型を持つ方針で十分。

### 9.3 却下: hash / 属性ベースルーティング

hash ルート、`data-route` 属性ベース分岐、クライアントルータ（pushState 遷移）はいずれも検討の上不採用。最終形は「単一 index.html + SPA フォールバック + `location.pathname` をマウント時に読んで分岐 + 遷移は素のリンク（フルリロード）+ History API はスライド位置のみ」。

### 9.4 却下: server-ref / data 仮想モジュール化

Slidev の server-ref（WebSocket 状態同期）はマルチデバイス不要のため、data の仮想モジュール化は失敗状態・静的二重性のため不採用（[§5.1](#51-slides-meta-はミドルウェアのまま)）。
