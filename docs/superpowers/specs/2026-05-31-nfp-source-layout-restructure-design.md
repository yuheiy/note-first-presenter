# `packages/note-first-presenter` ソースレイアウト再構成 設計ドキュメント

- 作成日: 2026-05-31
- 対象: `packages/note-first-presenter/src/` のディレクトリ構成変更（実装ロジック不変）
- ステータス: 設計確定
- 参考実装: [slidev](https://github.com/slidevjs/slidev) `packages/slidev/node/` の規約

## 1. 目的とスコープ

`packages/note-first-presenter/src/` をエンティティドメイン駆動の構成に再編成し、CLI まわりは slidev `packages/slidev/node/` の規約に寄せる。目的は次の二点。

- **ドメインの自己完結性** — 「Slides に手を入れる時は `slides.ts` だけ見ればよい」「Notes も同様」が成り立つよう、各エンティティに関する全機能(パス解決・I/O・解釈)を 1 ファイルに集約する。
- **既存の不整合の解消** — `plugin/virtual-modules.ts` は実は virtual module を提供していない（中身は `dbPath`/`cacheRoot` の path 計算のみ）。再構成のついでに命名と置き場を実態に合わせる。

### 1.1 含まないもの（YAGNI）

- ロジックの書き換え（純粋なファイル移動・統合・分割のみ）。
- 公開 API の変更（`index.ts` の `defineConfig` と CLI 引数は不変）。
- `@note-first-presenter/client` パッケージへの波及。
- slidev の user-extensible setup 機構（`setups/load.ts` の `loadSetups`）の導入。nfp には対応する拡張ポイントが無いため不要。

## 2. nfp のエンティティ

nfp が扱う「もの」は 3 つに大別できる:

1. **Config** — ユーザーが書く `note-first-presenter.config.ts` と、そこから派生する build/export オプション。
2. **Slides** — 入力 PDF(およびそこから生成されるスライド画像)。
3. **Notes** — `.note-first-presenter.json` に格納される outline と title。

CLI / Vite plugin / HTTP middleware / build / export はいずれも上記エンティティに対する**操作**であって、エンティティそのものではない。各操作はエンティティの公開関数を呼ぶ。

## 3. slidev から取り込む規約

エンティティ層は nfp 固有の整理だが、操作層は slidev の規約に揃える:

| slidev 概念                                           | nfp での扱い                                         |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `cli.ts`(全 command 登録、dispatch)                   | 同パターンで採用                                     |
| `commands/{dev,build,export,shared}.ts`               | 同名で採用、`run*` ではなく動詞名で関数を export     |
| `vite/` = Vite plugin 専用                            | 同名で採用                                           |
| `vite/index.ts` が plugin 配列を返す                  | 同名で採用                                           |
| `commands/shared.ts` が `resolveViteConfigs` 等を持つ | nfp の `createViteConfig`(InlineConfig 組立)もここへ |
| `setups/` (user setup loader)                         | 不採用(nfp に拡張機構なし)                           |
| `integrations/` (themes/addons/drawings/snapshots)    | 不採用(対応概念なし)                                 |
| `virtual/` (virtual modules)                          | 不採用(現状 virtual module は存在しない)             |

## 4. 最終レイアウト

```
src/
  cli.ts                  # 全 defineCommand 登録 + sharedServerArgs + options 解決 → commands を呼ぶ
  index.ts                # 公開 API: defineConfig（不変）
  config.ts               # ユーザー config: schema/型 + loadNfpConfig + resolveBuildOptions + resolveExportOptions
  slides.ts               # スライド deck: resolveSlidesPath + PDF→画像 + cache + filename + batch render + cacheRootFor
  notes.ts                # ノート: DB I/O + DB schema + outline JSON 解釈 + dbPathFor
  commands/
    dev.ts                # createServer(opts): Promise<ViteDevServer> を export（listen/SIGINT は cli.ts）
    build.ts              # build(opts): Promise<void> を export + writeBuildData inline
    export.ts             # exportPage(opts): Promise<string> を export + format/context/default-template/types/runPipelineExport を inline
    shared.ts             # createViteConfig + resolveClientRoot
  vite/
    index.ts              # createNfpVitePlugins(): [svelte, paraglide, ViteNfpPlugin] を返す
    plugin.ts             # ViteNfpPlugin: configureServer + closeBundle、state を所有
    api.ts                # createApiMiddleware (Connect factory)
    watchers.ts           # initFileWatchers (chokidar factory)
```

**消えるディレクトリ:** `config/`, `middleware/`, `plugin/`, `node/`, `node/pipeline/`

**ファイル数:** top-level 5, `commands/` 4, `vite/` 4。slidev top-level(`options.ts` 142 / `resolver.ts` 278 / `utils.ts` 143) と比べ、nfp のドメイン分割ファイルも同等のサイズ(80-220 行)に収まる。

## 5. エンティティ別の内容と帰属判断

### 5.1 `config.ts`（~98 行）

| 機能                                                     | 由来                    |
| -------------------------------------------------------- | ----------------------- |
| `configSchema` / `NoteFirstPresenterConfig`              | `config/schema.ts`      |
| `loadNfpConfig(cwd)`                                     | `config/load-config.ts` |
| `resolveBuildOptions(...)` / `resolveExportOptions(...)` | `config/defaults.ts`    |

ユーザーが書く `note-first-presenter.config.ts` に関する一切(定義・読込・派生オプション)を集約。

### 5.2 `slides.ts`（~220 行）

| 機能                                                                                          | 由来                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------ |
| `resolveSlidesPath(...)` / `SlidesStatus`                                                     | `config/resolve-slides-path.ts`      |
| `ensurePdfState` / `getSlidesMeta` / `getSlideImage` / `getSlideSize` / `PageOutOfRangeError` | `node/pdf-renderer.ts`               |
| `slideCachePath` / `pruneOtherHashes`                                                         | `node/slide-cache.ts`                |
| `slideFilename`                                                                               | `node/slide-filename.ts`             |
| `renderAllSlides(...)`                                                                        | `node/pipeline/render-slides.ts`     |
| `cacheRootFor(cwd)`                                                                           | `plugin/virtual-modules.ts` から抽出 |

スライド deck(PDF とそこから生成される画像)に関する一切を集約。`resolveSlidesPath` を含めるのは「PDF の場所を知る」のも Slides の責務という判断。

### 5.3 `notes.ts`（~80 行）

| 機能                                                            | 由来                                 |
| --------------------------------------------------------------- | ------------------------------------ |
| `readDb` / `writeDb` / `defaultDb`                              | `node/db-io.ts`                      |
| `dbInputSchema`                                                 | `node/db-schema.ts`                  |
| `paragraphText` / `isSeparatorItem` / `docToItems` / `JsonNode` | `node/pipeline/json-doc.ts`          |
| `splitNoteGroups` / `NoteNode`                                  | `node/pipeline/note-tree.ts`         |
| `dbPathFor(cwd)`                                                | `plugin/virtual-modules.ts` から抽出 |

`.note-first-presenter.json` の I/O・検証・outline 構造の解釈を集約。

## 6. ファイル単位マッピング(操作層)

### 6.1 既存ファイル → 新規ファイル(操作層 + エンティティ層)

| 現状                                | 移行先                                                                                                           | 備考                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`                            | `cli.ts`(dispatch・args 解決・dev lifecycle) + `commands/{dev,build,export}.ts`(実装関数) + `commands/shared.ts` | citty `defineCommand` は cli.ts に全部残し、`run` 本体から `createServer`/`build`/`exportPage` を呼ぶ。dev の listen/printUrls/SIGINT は cli.ts 側 |
| `index.ts`                          | `index.ts`                                                                                                       | 不変                                                                                                                                               |
| `config/schema.ts`                  | `config.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `config/defaults.ts`                | `config.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `config/load-config.ts`             | `config.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `config/resolve-slides-path.ts`     | `slides.ts`                                                                                                      | スライド deck の場所解決として Slides に帰属                                                                                                       |
| `plugin/index.ts`                   | `vite/plugin.ts`                                                                                                 | ViteNfpPlugin 本体                                                                                                                                 |
| `plugin/file-watchers.ts`           | `vite/watchers.ts`                                                                                               | factory のまま移動                                                                                                                                 |
| `plugin/virtual-modules.ts`         | `notes.ts`(`dbPathFor`) + `slides.ts`(`cacheRootFor`)                                                            | path helpers を各ドメインに分配。`buildRuntimeConfigObject` ラッパは廃止                                                                           |
| `middleware/api.ts`                 | `vite/api.ts`                                                                                                    | factory のまま移動                                                                                                                                 |
| `vite/config.ts`                    | `vite/index.ts`(plugin 配列) + `commands/shared.ts`(createViteConfig)                                            | InlineConfig 組立とプラグイン定義を分離                                                                                                            |
| `node/db-io.ts`                     | `notes.ts`                                                                                                       | エンティティ統合                                                                                                                                   |
| `node/db-schema.ts`                 | `notes.ts`                                                                                                       | エンティティ統合                                                                                                                                   |
| `node/pdf-renderer.ts`              | `slides.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `node/slide-cache.ts`               | `slides.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `node/slide-filename.ts`            | `slides.ts`                                                                                                      | エンティティ統合                                                                                                                                   |
| `node/pipeline/note-tree.ts`        | `notes.ts`                                                                                                       | outline 構造解釈として Notes に帰属                                                                                                                |
| `node/pipeline/json-doc.ts`         | `notes.ts`                                                                                                       | outline JSON helpers として Notes に帰属                                                                                                           |
| `node/pipeline/render-slides.ts`    | `slides.ts`                                                                                                      | スライド画像の disk 書き出しとして Slides に帰属                                                                                                   |
| `node/pipeline/build-data.ts`       | `commands/build.ts`                                                                                              | inline                                                                                                                                             |
| `node/pipeline/export.ts`           | `commands/export.ts`                                                                                             | inline、orchestrator                                                                                                                               |
| `node/pipeline/format.ts`           | `commands/export.ts`                                                                                             | inline(format は export 専用の整形)                                                                                                                |
| `node/pipeline/context.ts`          | `commands/export.ts`                                                                                             | inline                                                                                                                                             |
| `node/pipeline/default-template.ts` | `commands/export.ts`                                                                                             | inline                                                                                                                                             |
| `node/pipeline/types.ts`            | `commands/export.ts`                                                                                             | inline                                                                                                                                             |

### 6.2 テストファイル → 新規位置

各テストは「対象ソースの隣接 `__tests__/`」へ追従する。複数の現状テストが同じ移行先に統合される場合は、新規ファイル内で既存の `describe(...)` ブロックを並べる形で統合する。

| 現状                                            | 移行先                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `config/__tests__/defaults.test.ts`             | `__tests__/config.test.ts`                                                                  |
| `config/__tests__/load-config.test.ts`          | `__tests__/config.test.ts`                                                                  |
| `config/__tests__/resolve-slides-path.test.ts`  | `__tests__/slides.test.ts`                                                                  |
| `middleware/__tests__/api.test.ts`              | `vite/__tests__/api.test.ts`                                                                |
| `plugin/__tests__/virtual-modules.test.ts`      | `__tests__/notes.test.ts`(`dbPathFor`) と `__tests__/slides.test.ts`(`cacheRootFor`) に分配 |
| `node/__tests__/db-io.test.ts`                  | `__tests__/notes.test.ts`                                                                   |
| `node/__tests__/slide-cache.test.ts`            | `__tests__/slides.test.ts`                                                                  |
| `node/__tests__/pdf-renderer.test.ts`           | `__tests__/slides.test.ts`                                                                  |
| `node/__tests__/fixtures/sample.pdf`            | `__tests__/fixtures/sample.pdf`                                                             |
| `node/pipeline/__tests__/note-tree.test.ts`     | `__tests__/notes.test.ts`                                                                   |
| `node/pipeline/__tests__/format.test.ts`        | `commands/__tests__/export.test.ts`                                                         |
| `node/pipeline/__tests__/context.test.ts`       | `commands/__tests__/export.test.ts`                                                         |
| `node/pipeline/__tests__/build-data.test.ts`    | `commands/__tests__/build.test.ts`                                                          |
| `node/pipeline/__tests__/render-slides.test.ts` | `__tests__/slides.test.ts`                                                                  |
| `node/pipeline/__tests__/export.test.ts`        | `commands/__tests__/export.test.ts`                                                         |
| `__tests__/build-integration.test.ts`           | `__tests__/build-integration.test.ts`(据置・CLI 統合)                                       |
| `__tests__/export-bin-integration.test.ts`      | `__tests__/export-bin-integration.test.ts`(据置)                                            |

inline 対象(`commands/{build,export}.ts` への併合)についても、当該関数は export を維持し、test はその export を import して呼ぶ。

## 7. `vite/` 分割の根拠

`vite/` 配下を 4 ファイル(`index.ts`/`plugin.ts`/`api.ts`/`watchers.ts`)に分けるのは次の理由:

- **index.ts と plugin.ts の分離**: slidev `vite/index.ts` は plugin 配列を返す関数のみを持ち、個別 plugin 本体は別ファイル(`vite/loaders.ts` 等)。nfp も同パターンで、`index.ts` が `[svelte, paraglide, ViteNfpPlugin]` を返し、`plugin.ts` が ViteNfpPlugin 本体。
- **api.ts と watchers.ts は factory のまま分離**: 現状の `createApiMiddleware`/`initFileWatchers` は副作用のない factory で、単体テストが容易。これらを ViteNfpPlugin の内部実装にせず独立ファイルに保つことで testability を維持。
- **plugin.ts が state を所有**: api と watchers は共有 mutable state(`current` config snapshot)で連携している。各々を独立 Vite plugin にすると共有 state ファイルが必要になり、nfp の規模では割高。よって ViteNfpPlugin が `current` を所有し、api/watchers は factory として呼び出される現状の設計を保つ。
- **`extend-config.ts` 不採用**: slidev `vite/extendConfig.ts`(215 行) は HMR patch, history fallback, manualChunks など実体ある拡張を集める。nfp の対応物は単純な alias/define/build オプションで、`commands/shared.ts` の `createViteConfig` 内で十分。
- **`virtual.ts` 不採用**: 現状 virtual module は実在しない。将来 virtual module を追加する際は別途 `vite/virtual.ts` を作成する。

## 8. InlineConfig アセンブリの置き場

slidev は `commands/shared.ts` で `resolveViteConfigs` を提供し、dev/build 双方から呼ぶ。nfp も同パターンで `commands/shared.ts` に `createViteConfig` を置く。これにより:

- `vite/` は plugin 専用ディレクトリとして純化される。
- `commands/dev.ts` と `commands/build.ts` は同じ `createViteConfig` を共有でき、root/alias/define の重複が消える。

## 9. `buildRuntimeConfigObject` の解体

現状の `plugin/virtual-modules.ts` の `buildRuntimeConfigObject` は `dbPath`/`cacheRoot` の path 計算ラッパに過ぎず、virtual module でも runtime config でもない。各 path helper を所属ドメインに移し、ラッパは廃止する:

```ts
// notes.ts
export function dbPathFor(cwd: string): string {
  return path.join(cwd, '.note-first-presenter.json');
}

// slides.ts
export function cacheRootFor(cwd: string): string {
  return path.join(cwd, 'node_modules', '.note-first-presenter');
}
```

現状 `cli.ts` の build/export サブコマンドで直接 `path.join(cwd, '.note-first-presenter.json')` を構築している箇所もこのヘルパに置換し、重複を解消する。

## 10. 移行順

1. **エンティティ層の作成**: `config.ts`, `slides.ts`, `notes.ts` を新規作成し、対応する現状ファイルから内容を移動。隣接テストも `__tests__/{config,slides,notes}.test.ts` に統合移動。`vp check` / `vp test` を通す。
2. **`commands/` 作成**: `cli.ts` の `defineCommand` の `run` 本体を `commands/{dev,build,export}.ts` の `createServer`/`build`/`exportPage` に切り出し、`commands/shared.ts` に `resolveClientRoot` を置く。pipeline 関連の inline もここで実施。テスト移行も同タスク内。`vp check` / `vp test` を通す。
3. **`vite/` 再構成**: `plugin/`・`middleware/`・既存 `vite/config.ts` を `vite/{index,plugin,api,watchers}.ts` に再配置。`commands/shared.ts` に `createViteConfig` を追加。`vp check` / `vp test` / e2e を通す。
4. **旧ディレクトリ削除**: `config/`, `middleware/`, `plugin/`, `node/` を削除。残ファイルがないこと、import が壊れていないことを確認。

各ステップ完了時点で `vp check` / `vp test` が通ること、最終ステップで e2e も通ることを条件とする。

## 11. 公開 API への影響

- `note-first-presenter` パッケージの公開 export は `defineConfig` のみ(`exports[".": "./dist/index.mjs"]`)。`src/index.ts` の中身は不変なので公開 API は変わらない。
- CLI バイナリ(`bin/note-first-presenter.mjs`) の引数・サブコマンドは変わらない。
- `@note-first-presenter/client` および `e2e/` への変更は無い。
