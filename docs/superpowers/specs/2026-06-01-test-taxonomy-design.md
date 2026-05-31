# テスト層の再設計

- 日付: 2026-06-01
- ステータス: spec（実装計画は別 plan で策定）
- 関連: `docs/superpowers/specs/2026-05-30-client-server-rearchitecture-design.md`

## 背景

現状、vitest（161 件）と Playwright（11 件）の二層構成だが、両者の境界が運用上曖昧になっている。具体的には次の症状が観測される。

- `*-integration.test.ts`（`vp pack` + `execFileSync(bin)` で実 CLI を 180 秒タイムアウトで起動）が vitest に同居しており、`vp test` のフィードバックを遅らせている。
- `vite/__tests__/plugin.test.ts` は自作の mock req/res で Connect ミドルウェアを叩く unit 寄りの形だが、同じ API を e2e の `slideshow-sync.e2e.ts` が `page.request` 経由で本物の HTTP として叩く層も存在する。両者の責務境界が文書化されていない。
- Svelte コンポーネント／`$state` ベースのストアに対するテストが 0 件。`@vitest/browser-playwright`／`vitest-browser-svelte` を devDependencies に持ちながら導入されていない。
- 命名規約は `__tests__/*.test.ts` と `e2e/*.e2e.ts` のみで、`*-integration.test.ts` のような第 3 形態が無規約に存在する。

本仕様は (A) 層の境界を明文化し、(B) Svelte コンポーネント層を新設し、(C) CLI 統合テストを `vp test` から分離する。あわせて (D) 責務にそぐわない既存テストを削除・再配置する。

## 1. テスト層の定義

4 層を「ホスト環境」「実物 vs ダブル」の二軸で定義する。

| 層                  | ランナー                                                | ホスト                                 | 実物                                                                              | ダブル化                                                             | 判定基準                                                                                      |
| ------------------- | ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **unit**            | vitest                                                  | Node（client は happy-dom）            | 自前ロジック、`fs`、`prosemirror-state`、`@napi-rs/canvas` の PDF レンダー        | DOM 描画、ネットワーク、`BroadcastChannel`、実ブラウザは持ち込まない | Node 内で完結。副作用は `fs`/temp cwd まで                                                    |
| **component**       | vitest（browser project, `@vitest/browser-playwright`） | 実 Chromium（headless）                | DOM 描画、ARIA                                                                    | `fetch`／ストア／`BroadcastChannel`：props か軽量 fake               | Svelte 出力 DOM／ARIA／状態分岐を観察したい。ProseMirror 等フレームワーク級依存は持ち込まない |
| **cli-integration** | vitest（別 project `cli`）                              | Node 子プロセス                        | `vp pack` で packed bin、本物の `execFileSync(bin, ...)`、temp cwd                | なし（fixture PDF と config は実物）                                 | `bin/note-first-presenter.mjs` を本物として起動するもの                                       |
| **e2e**             | Playwright                                              | 実 Chromium + CLI の `vite dev` サーバ | dev server、`/api/*` HTTP、ProseMirror エディタ、`BroadcastChannel`、複数タブ協調 | なし                                                                 | ユーザー視点フロー、または複数プロセス／タブの協調                                            |

### 境界の運用ルール

1. **Connect ミドルウェア** (`handleApiRequest` 等) は unit に置く。mock req/res は許容。本物の HTTP を 1 経路だけ通したいときは e2e の `page.request` でカバー。
2. **Svelte コンポーネントを 1 つでもレンダーする** テストは component 以上。`$state` ストア単体（レンダーしない）は unit。
3. **`bin/*.mjs` を起動する** テストは cli-integration 一択。`commands/*.ts` 関数を直接 import するテストは unit。
4. **複数ページ／本物の `BroadcastChannel`／キーマップ UA 判定** は e2e 一択。

## 2. ファイル配置と命名規約

層をファイル名で一意に決められるようにする。

```
packages/note-first-presenter/src/
├─ <module>.ts
└─ __tests__/<module>.test.ts            # unit

packages/note-first-presenter/test/
├─ __fixtures__/sample.pdf               # 全層共有
└─ cli/
   ├─ build.cli.test.ts                  # cli-integration
   └─ export.cli.test.ts

packages/client/src/
└─ lib/<feature>/__tests__/
   ├─ Foo.test.ts                        # unit
   └─ Foo.browser.test.ts                # component

e2e/
└─ *.e2e.ts                              # Playwright
```

| パターン                                               | 層              | 起動コマンド                 |
| ------------------------------------------------------ | --------------- | ---------------------------- |
| `**/__tests__/*.test.ts`                               | unit            | `vp test`（unit project）    |
| `**/__tests__/*.browser.test.ts`                       | component       | `vp test`（browser project） |
| `packages/note-first-presenter/test/cli/*.cli.test.ts` | cli-integration | `pnpm test:cli`              |
| `e2e/*.e2e.ts`                                         | e2e             | `pnpm test:e2e`              |

## 3. Vitest workspaces 構成

`vp test` は `vite.config.ts` の `test` ブロックを読む。各パッケージに `test.projects` を 1 つ持たせ、層ごとに環境を切る。

### `packages/client/vite.config.ts`（新規作成）

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte()],
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['src/**/__tests__/*.test.ts'],
          exclude: ['src/**/__tests__/*.browser.test.ts'],
        },
      },
      {
        plugins: [svelte()],
        test: {
          name: 'component',
          include: ['src/**/__tests__/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: '@vitest/browser-playwright',
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
    ],
  },
});
```

### `packages/note-first-presenter/vite.config.ts`（既存に追記）

既存の `pack` / `lint` / `fmt` ブロックには触れず、`test` ブロックのみ追加。

```ts
test: {
  projects: [
    {
      test: {
        name: 'unit',
        environment: 'node',
        include: ['src/**/__tests__/*.test.ts'],
      },
    },
    {
      test: {
        name: 'cli',
        environment: 'node',
        include: ['test/cli/*.cli.test.ts'],
        testTimeout: 180_000,
        hookTimeout: 180_000,
        globalSetup: ['./test/cli/setup-pack.ts'],
      },
    },
  ],
},
```

`setup-pack.ts` で `vp pack` を 1 回だけ実行する（リスク R3 への対応）。

### 起動コマンド

| コマンド                  | 動かす project                          | 用途                           |
| ------------------------- | --------------------------------------- | ------------------------------ |
| `vp test`（各パッケージ） | unit + component（client）／unit（nfp） | 高速ローカルループ             |
| `vp test --project=unit`  | unit のみ                               | ストア・純ロジックのみ         |
| ルート `pnpm test:cli`    | cli のみ（nfp パッケージ）              | `ready` で 1 回／CI 別ジョブ可 |
| `pnpm test:e2e`（既存）   | —                                       | Playwright                     |

`pnpm test:cli` の中身: `pnpm -F note-first-presenter exec vitest run --project=cli`。

### `ready` の再定義

```json
"ready": "vp check && vp run -r test && pnpm test:cli && vp run test:e2e && vp run -r build"
```

`vp run -r test` はパッケージごとの `test` スクリプト（`vp test`）を呼ぶため、各パッケージで `cli` project が `projects` に登録されていても、デフォルト実行から除外する必要がある。**`cli` project は明示 `--project=cli` 指定時のみ走るよう、登録時に `include` を空グロブ的に扱う仕組みは Vitest に存在しない**ため、運用としては「ルート `package.json` の `test:cli` から `--project=cli` で明示起動し、各パッケージの `vp test` は `--project=unit,component` を明示する」方針を取る。

具体的には各パッケージの `package.json` を次のように変える:

```json
// packages/note-first-presenter/package.json
"test": "vp test --project=unit"

// packages/client/package.json
"test": "vp test --project=unit,component"
```

これによりローカルの `vp test` と `vp run -r test` は unit + component のみ走り、`pnpm test:cli` だけが cli を起動する。

## 4. 追加するテスト一覧

B 採用に伴い、空白を埋める。

### 4-1. Store の unit（vitest, happy-dom）

| 対象                                            | テスト先                               | 観点                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/active-slide/active-slide-store.svelte.ts` | `__tests__/active-slide-store.test.ts` | (1) 初期値が `location.pathname` から推定される、(2) `set(n)` が `history.replaceState` で URL を書き換える、(3) `BROWSER === false` で no-op |
| `lib/slides-meta/slides-meta-store.svelte.ts`   | `__tests__/slides-meta-store.test.ts`  | (1) `ofetch` をモックして 200／422／失敗の 3 経路、(2) 再フェッチ                                                                             |
| `lib/db/client.svelte.ts`                       | `__tests__/db-client.test.ts`          | (1) GET 初期化、(2) PUT のデバウンス／書き込み中の二重 set                                                                                    |
| `lib/theme/theme-store.svelte.ts`               | `__tests__/theme-store.test.ts`        | (1) `matchMedia` 結果の反映、(2) 変更イベントの追従                                                                                           |

### 4-2. Sync の unit（vitest, happy-dom）

| 対象                          | テスト先                            | 観点                                                                                                                                                                   |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/sync/sync-publisher.ts`  | `__tests__/sync-publisher.test.ts`  | (1) `publishActiveSlide(n)` が `BroadcastChannel.postMessage` を `{ type:'active-slide', slide:n }` で呼ぶ、(2) `BROWSER === false` で no-op、(3) `destroy()` で close |
| `lib/sync/sync-subscriber.ts` | `__tests__/sync-subscriber.test.ts` | (1) subscribe → message 受信、(2) unsubscribe で listener が外れる、(3) `BROWSER === false` でも安全                                                                   |

### 4-3. Leaf コンポーネントの component（vitest browser, `vitest-browser-svelte`）

| 対象                                            | テスト先                                          | 観点                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `lib/slide-status/SlideListErrorOverlay.svelte` | `__tests__/SlideListErrorOverlay.browser.test.ts` | `SlidesStatus.kind` 4 種の DOM／ARIA 分岐                                                                      |
| `lib/slide-status/SlideListHint.svelte`         | `__tests__/SlideListHint.browser.test.ts`         | props 別のヒント文言                                                                                           |
| `lib/slide-status/SlideshowFallback.svelte`     | `__tests__/SlideshowFallback.browser.test.ts`     | フォールバック表示の ARIA                                                                                      |
| `lib/slide-image/SlideImage.svelte`             | `__tests__/SlideImage.browser.test.ts`            | props (`hash`, `page`) と `slideUrl()` の組み合わせで `<img src>`／`alt` が正しい（`__NFP_STATIC__` 両モード） |

### 4-4. CLI integration の追補（移設 2 + ケース追加 1）

| 対象           | テスト先                               | 観点                                                                                        |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 既存           | `test/cli/build.cli.test.ts`           | 変更なし、移設のみ                                                                          |
| 既存           | `test/cli/export.cli.test.ts`          | 変更なし、移設のみ                                                                          |
| **新規ケース** | `test/cli/export.cli.test.ts` 内に追加 | `--template <eta>` でユーザー指定テンプレが読まれて HTML 以外（`.md`）が出る CLI フラグ結線 |

### 4-5. あえて追加しないもの（YAGNI 判定）

- `runBuild` 関数の unit（`vite.build` 起動を伴い cli-integration と等価）
- `Presenter.svelte`／`Outliner.svelte` の component（ProseMirror 含む → モック地獄／e2e がカバー）
- `App.svelte` のパス分岐 component（`location.pathname` の単純分岐、e2e でカバー）
- `handleApiRequest` を本物の Vite middleware 経由で叩く HTTP テスト（e2e の `page.request` が 1 経路を既にカバー）

## 5. 既存テストの再配置（振る舞いは不変）

| 現在                                                                         | 移動先                                                        | 種別                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `packages/note-first-presenter/src/__tests__/build-integration.test.ts`      | `packages/note-first-presenter/test/cli/build.cli.test.ts`    | cli へ昇格・改名       |
| `packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts` | `packages/note-first-presenter/test/cli/export.cli.test.ts`   | cli へ昇格・改名       |
| `packages/note-first-presenter/src/__tests__/fixtures/sample.pdf`            | `packages/note-first-presenter/test/__fixtures__/sample.pdf`  | 共有 fixture 化        |
| 参照側 4 ファイル                                                            | `import.meta.dirname` 相対パスを更新                          | path 変更のみ          |
| `packages/note-first-presenter/src/__tests__/use-temp-cwd.ts`                | `packages/note-first-presenter/test/_helpers/use-temp-cwd.ts` | unit／cli 共有ヘルパへ |

## 5.5. 重複・不適切配置の整理

### A. e2e `outliner-range.e2e.ts` の縮減（5 件 → 2 件）

e2e の責務は「キーマップ／bullet click ジェスチャ／UA 依存の Mac 判定が実ブラウザで結線されていること」に絞る。

| 現在の e2e ケース                                                           | 同義の unit                                                        | 判定                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `Shift+Click on a bullet extends a NodeRangeSelection from the anchor item` | （bullet click ジェスチャは e2e 専管）                             | **残す**                                                                                 |
| `Mod+Shift+ArrowDown moves a NodeRangeSelection past the next sibling`      | `range-commands.test.ts > moveItemUp/Down on a NodeRangeSelection` | **残す**（過去に Mac UA 判定で実害ハマり。実ブラウザの UA 経由 keymap を通す価値が高い） |
| `Shift+ArrowDown extends a single-item NodeRangeSelection downward`         | `range-select.test.ts`                                             | **削除**（unit と同義）                                                                  |
| `Backspace on a NodeRangeSelection deletes the entire range`                | `range-commands.test.ts > smartBackspace on a NodeRangeSelection`  | **削除**（unit と同義）                                                                  |
| `Tab indents a NodeRangeSelection under the previous sibling`               | `range-commands.test.ts > rangeAwareSinkListItem (Tab)`            | **削除**（unit と同義）                                                                  |

### B. `outliner/__tests__/paste.test.ts` のファイル先頭 `// @vitest-environment happy-dom` を削除

唯一このファイルだけが per-file env ディレクティブを持つ（`DOMParser` 利用のため）。新設の `packages/client/vite.config.ts` で unit project の `environment` を `happy-dom` に統一するため不要となる。

### C. ボーダーだが保持するもの

| テスト                                                                                        | 観察                                       | 判定根拠                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite/__tests__/plugin.test.ts`（自作 mock req/res）                                          | Connect の `next` を直接観察、実装詳細寄り | エラー系・db API 系を e2e に移すと 4〜6 件追加され重い。unit で安価に網羅する現状が合理的                                                                 |
| `commands/__tests__/build.test.ts` × `test/cli/build.cli.test.ts` の重複                      | meta.json／db.json の assert が両方にある  | unit は `writeBuildData` の API 契約と分岐網羅（`no-config-no-file` 経路を含む）、cli は packed bin + SPA shell + 200.html フォールバックの結線。責務直交 |
| `commands/__tests__/export.test.ts` × `test/cli/export.cli.test.ts` の built-in template 重複 | HTML 出力 assert が両方にある              | unit は `exportPage` 3 分岐、cli は packed bin に built-in template がバンドルされている過去 ENOENT バグ再発防止                                          |
| `outliner/__tests__/active-slide.test.ts` × nfp `notes.test.ts`                               | 両方が `---` 分割を検証                    | 別パッケージ・別実装（client は ProseMirror Node、nfp は JSON Doc）。独立実装の独立検証                                                                   |
| e2e `presenter.e2e.ts > renders presenter shell with slide list`                              | 浅いスモーク                               | 全スタック boot スモークとして妥当                                                                                                                        |
| e2e `slideshow-sync.e2e.ts > slide image endpoint serves a webp image`                        | unit と一部重複                            | 本物 Vite middleware + 本物 PDF + HTTP ヘッダの結線を見る唯一のテスト                                                                                     |

## 6. 規約のドキュメント化

実装後、`CLAUDE.md` の `<!--VITE PLUS END-->` の下に手動で次の段落を追記する。

```md
## Testing layers

- `**/__tests__/*.test.ts` — unit (vitest, Node or happy-dom)
- `**/__tests__/*.browser.test.ts` — component (vitest browser, Chromium)
- `packages/note-first-presenter/test/cli/*.cli.test.ts` — CLI integration (vitest, runs packed bin)
- `e2e/*.e2e.ts` — end-to-end (Playwright)

Layer is determined by the filename. See `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md` for the criteria.
```

## 7. 実装順序

1. **設定基盤**: 各 `vite.config.ts` に `test.projects` を入れ、各 `package.json` の `test` スクリプトを `--project=unit[,component]` に更新。既存テストがそのまま緑のまま新 project 名で走ることを確認（テスト本体は触らない）。
2. **再配置**: `*-integration.test.ts` を `test/cli/` へ移動、fixture を `test/__fixtures__/` に共有化、`use-temp-cwd.ts` を共有ヘルパへ。`vp test` から消えて `pnpm test:cli` で動くことを確認。
3. **component 環境立ち上げ**: `client` の browser project を有効化し、リスク R2 検証のため `SlideListErrorOverlay.browser.test.ts` を最初に書く。
4. **追加テスト**: 4-1 → 4-2 → 4-3 残り → 4-4 の順に積む。
5. **削除**: 5.5-A の e2e 3 件、5.5-B の per-file env ディレクティブを削除。
6. **CLAUDE.md 追記** と **`pnpm ready` の整備**、`globalSetup` で `vp pack` を 1 回化（R3）。

各ステップ末に `vp check` / `vp test` / `pnpm test:cli` / `pnpm test:e2e` が緑であることを確認。

## 8. 集計

| 層              |                 既存 |       +追加 | -削除 |              合計 |
| --------------- | -------------------: | ----------: | ----: | ----------------: |
| unit            | 23 ファイル / 161 件 | +6 ファイル |     0 |       29 ファイル |
| component       |                    0 | +4 ファイル |     0 |        4 ファイル |
| cli-integration |   2 ファイル（移設） |           0 |     0 |        2 ファイル |
| e2e             |   3 ファイル / 11 件 |           0 | -3 件 | 3 ファイル / 8 件 |

## 9. リスクと未解決事項

### R1. vite-plus が `test.projects` を透過する保証

公式 docs に `projects` 固有の言及はない。Vitest v3 のネイティブ機能なので透過するはずだが未検証。

- 検出: 実装順序 Step 1 で `vp test --project=unit` が機能するか確認。
- フォールバック: project ごとに独立した `vite.config.ts` を `vp test path/to/config.ts` で叩く構成に切り替え。

### R2. `vitest-browser-svelte` × Svelte 5（runes）の互換

`vitest-browser-svelte` の最新版は Svelte 5 対応を謳うが、本プロジェクトの runes ベースコンポーネントで `render()` 経由 props 渡しが期待どおり動くかは未検証。

- 検出: 4-3 の `SlideListErrorOverlay.browser.test.ts` を最初に書き、動かなければ後続を止める。
- フォールバック: 当該コンポーネントを `setContext` 経由で動かす薄い wrapper を component 用に追加。

### R3. CLI integration テストのキャッシュ非効率

`build.cli.test.ts` と `export.cli.test.ts` がそれぞれ `vp pack` を呼ぶと二重実行。`vite.config.ts` cli project の `globalSetup` で 1 回に集約する。

### R4. e2e の `fullyParallel: false`

`/api/db` を共有するため並列化は不可。本仕様では触らない。

### R5. `__fixtures__/` ディレクトリ移動による参照切れ

1 PR 内で `git mv` + 全参照更新を同時にコミット、`vp test` 緑で確認。

### R6. CLAUDE.md 追記の位置

既存 `<!--VITE PLUS END-->` の下に手動セクションを追記（次回 `vp config` 更新の影響を受けない位置）。

### 範囲外

- カバレッジ計測（`vp test --coverage`）の閾値設定
- e2e の複数 fixture 拡張
- visual regression（スライド画像差分）
