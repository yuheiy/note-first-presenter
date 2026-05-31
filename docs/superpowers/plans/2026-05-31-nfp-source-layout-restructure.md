# note-first-presenter ソースレイアウト再構成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/note-first-presenter/src/` をエンティティドメイン駆動(`config.ts`/`slides.ts`/`notes.ts`)に再編成し、CLI まわりは slidev 規約(`commands/` + `vite/`)に揃える。実装ロジックは不変、純粋なファイル移動・統合・分割のみ。

**Architecture:** 3 エンティティ(Config・Slides・Notes)を top-level の単一ファイルに集約し、操作層(CLI dispatch / Vite plugin / HTTP middleware / build / export)を `commands/` と `vite/` 配下に分離する。`plugin/virtual-modules.ts` の `buildRuntimeConfigObject` ラッパは廃止し、`dbPathFor`/`cacheRootFor` を各エンティティに分配する。

**Tech Stack:** TypeScript, citty, valibot, @sveltejs/vite-plugin-svelte, @inlang/paraglide-js, chokidar, eta, Vite(`@voidzero-dev/vite-plus-core`), Vitest(`vite-plus/test`), Playwright(e2e), vite-plus.

設計: `docs/superpowers/specs/2026-05-31-nfp-source-layout-restructure-design.md`

**実装方針の注記:** 本計画は純粋な再配置である。既存実装をそのまま移す箇所は「移設 + import パス更新 + 既存テストで検証」とし、移設元のコード全文は再掲しない(パスのみ明示)。新規ロジックは無い。新規に作る関数(`dbPathFor`/`cacheRootFor` 等)はコードを明示する。各タスク末で `vp check`/`vp test` が緑になってからコミットする。最終タスクで e2e も通す。

---

## File Structure（最終状態）

```
packages/note-first-presenter/src/
  cli.ts                  # 全 defineCommand 登録 + sharedServerArgs + options 解決 → commands を呼ぶ
  index.ts                # 公開 API: defineConfig（不変）
  config.ts               # configSchema/型 + loadNfpConfig + resolveBuildOptions + resolveExportOptions
  slides.ts               # resolveSlidesPath + PDF 描画 + cache + filename + batch render + cacheRootFor
  notes.ts                # DB I/O + schema + outline 解釈 + dbPathFor
  __tests__/
    config.test.ts        # defaults + load-config の統合
    slides.test.ts        # resolve-slides-path + pdf-renderer + slide-cache + render-slides + cacheRootFor の統合
    notes.test.ts         # db-io + note-tree + dbPathFor の統合
    build-integration.test.ts        # 既存据置
    export-bin-integration.test.ts   # 既存据置
    fixtures/sample.pdf   # 既存
  commands/
    dev.ts                # createServer(opts): Promise<ViteDevServer>
    build.ts              # build(opts): Promise<void>（writeBuildData inline）
    export.ts             # exportPage(opts): Promise<string>（format/context/default-template/types/runPipelineExport inline）
    shared.ts             # createViteConfig + resolveClientRoot
    __tests__/
      build.test.ts       # build-data.test の引っ越し
      export.test.ts      # format + context + export.test の統合
  vite/
    index.ts              # createNfpVitePlugins(): [svelte, paraglide, ViteNfpPlugin] を返す
    plugin.ts             # ViteNfpPlugin: configureServer + closeBundle
    api.ts                # createApiMiddleware (Connect factory)
    watchers.ts           # initFileWatchers (chokidar factory)
    __tests__/
      api.test.ts         # middleware/api.test の引っ越し
```

消えるディレクトリ: `src/config/`, `src/middleware/`, `src/plugin/`, `src/node/`, `src/node/pipeline/`、`src/vite/config.ts`(同名再生成のため別ファイルへ)。

---

## Task 1: Notes エンティティ作成

**Files:**

- Create: `packages/note-first-presenter/src/notes.ts`
- Create: `packages/note-first-presenter/src/__tests__/notes.test.ts`
- Modify: `packages/note-first-presenter/src/middleware/api.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/export.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/build-data.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/context.ts`（NoteNode 型の import 元更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/format.ts`（NoteNode 型の import 元更新）
- Delete: `packages/note-first-presenter/src/node/db-io.ts`
- Delete: `packages/note-first-presenter/src/node/db-schema.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/json-doc.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/note-tree.ts`
- Delete: `packages/note-first-presenter/src/node/__tests__/db-io.test.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/note-tree.test.ts`

- [ ] **Step 1: notes.ts を作成**

`packages/note-first-presenter/src/notes.ts` を作成する。中身は次の順で連結:

1. 先頭の import 群(以下のみ):

   ```ts
   import { promises as fs } from 'node:fs';
   import path from 'node:path';
   import * as v from 'valibot';
   ```

2. **DB schema** — `src/node/db-schema.ts` の `dbInputSchema`/`DbInput`/`emptyDb` をそのままコピー(内部 import なし)。

3. **DB I/O** — `src/node/db-io.ts` の `readDb`/`writeDb` をコピー。内部 import `'./db-schema'` は不要(同ファイル内)。

4. **JSON doc helpers** — `src/node/pipeline/json-doc.ts` の `JsonNode`/`paragraphText`/`isSeparatorItem`/`docToItems` をコピー。

5. **Note tree** — `src/node/pipeline/types.ts` のうち `NoteNode` 型(他の `ExportSlide`/`ExportContext` は除外)と、`src/node/pipeline/note-tree.ts` の `splitNoteGroups` および internal `toNode` をコピー。`note-tree.ts` の `import` 群はすべて同ファイル内参照なので削除。

6. **Path helper** — 末尾に追加:

   ```ts
   export function dbPathFor(cwd: string): string {
     return path.join(cwd, '.note-first-presenter.json');
   }
   ```

- [ ] **Step 2: notes.test.ts を作成**

`packages/note-first-presenter/src/__tests__/notes.test.ts` を作成。次の test を統合:

- `src/node/__tests__/db-io.test.ts` の `describe('readDb' / 'writeDb')` ブロック → import 元を `'../notes'` に変更
- `src/node/pipeline/__tests__/note-tree.test.ts` の `describe('splitNoteGroups')` ブロック → import 元を `'../notes'` に変更
- 新規 `describe('dbPathFor')` を追加:

  ```ts
  describe('dbPathFor', () => {
    it('returns <cwd>/.note-first-presenter.json', () => {
      expect(dbPathFor('/proj')).toBe('/proj/.note-first-presenter.json');
    });
  });
  ```

- [ ] **Step 3: importers の import パスを更新**

次のファイルで、現状の import 文を `'../notes'` 等に書き換える(関数シグネチャは不変):

- `src/middleware/api.ts`: `import { readDb, writeDb } from '../node/db-io'` と `import { dbInputSchema } from '../node/db-schema'` を `import { readDb, writeDb, dbInputSchema } from '../notes'` に統合。
- `src/node/pipeline/export.ts`: `import { readDb } from '../db-io'` → `import { readDb } from '../../notes'`。`import { splitNoteGroups } from './note-tree'` → `import { splitNoteGroups } from '../../notes'`。
- `src/node/pipeline/build-data.ts`: `import { readDb } from '../db-io'` → `import { readDb } from '../../notes'`。
- `src/node/pipeline/context.ts`: `import type { ExportContext, ExportSlide, NoteNode } from './types'` を `import type { NoteNode } from '../../notes'` と `import type { ExportContext, ExportSlide } from './types'` に分割(ExportContext/ExportSlide は types.ts に残す)。
- `src/node/pipeline/format.ts`: `import type { NoteNode } from './types'` → `import type { NoteNode } from '../../notes'`。
- `src/node/pipeline/__tests__/context.test.ts`: `import type { NoteNode } from '../types'` → `import type { NoteNode } from '../../../notes'`。
- `src/node/pipeline/__tests__/format.test.ts`: `import type { NoteNode } from '../types'` → `import type { NoteNode } from '../../../notes'`。
- `src/node/pipeline/types.ts`: `NoteNode` を含む `ExportSlide` 型の参照を保つ場合は `import type { NoteNode } from '../../notes'` を先頭に追加し、`NoteNode` 自体の export 行を削除。

- [ ] **Step 4: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/node/db-io.ts
rm packages/note-first-presenter/src/node/db-schema.ts
rm packages/note-first-presenter/src/node/pipeline/json-doc.ts
rm packages/note-first-presenter/src/node/pipeline/note-tree.ts
rm packages/note-first-presenter/src/node/__tests__/db-io.test.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/note-tree.test.ts
```

- [ ] **Step 5: 検証**

Run: `vp check`
Expected: PASS（型エラー無し）

Run: `vp test -F note-first-presenter`
Expected: PASS（notes/context/format/build-data/export 等の関連 test がすべて緑）

- [ ] **Step 6: Commit**

```bash
git add packages/note-first-presenter/src/notes.ts \
        packages/note-first-presenter/src/__tests__/notes.test.ts \
        packages/note-first-presenter/src/middleware/api.ts \
        packages/note-first-presenter/src/node/pipeline/export.ts \
        packages/note-first-presenter/src/node/pipeline/build-data.ts \
        packages/note-first-presenter/src/node/pipeline/context.ts \
        packages/note-first-presenter/src/node/pipeline/format.ts \
        packages/note-first-presenter/src/node/pipeline/types.ts \
        packages/note-first-presenter/src/node/pipeline/__tests__/context.test.ts \
        packages/note-first-presenter/src/node/pipeline/__tests__/format.test.ts \
        packages/note-first-presenter/src/node/db-io.ts \
        packages/note-first-presenter/src/node/db-schema.ts \
        packages/note-first-presenter/src/node/pipeline/json-doc.ts \
        packages/note-first-presenter/src/node/pipeline/note-tree.ts \
        packages/note-first-presenter/src/node/__tests__/db-io.test.ts \
        packages/note-first-presenter/src/node/pipeline/__tests__/note-tree.test.ts
git commit -m "refactor(nfp): consolidate Notes entity into src/notes.ts"
```

---

## Task 2: Slides エンティティ作成

**Files:**

- Create: `packages/note-first-presenter/src/slides.ts`
- Create: `packages/note-first-presenter/src/__tests__/slides.test.ts`
- Modify: `packages/note-first-presenter/src/cli.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/middleware/api.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/plugin/index.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/plugin/virtual-modules.ts`（cacheRoot を撤去、dbPathFor も notes.ts へ振り替え済み）
- Modify: `packages/note-first-presenter/src/plugin/file-watchers.ts`（SlidesStatus 型の import 元更新）
- Modify: `packages/note-first-presenter/src/middleware/api.ts`（SlidesStatus 型の import 元更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/export.ts`（renderAllSlides の import 元更新）
- Modify: `packages/note-first-presenter/src/node/pipeline/build-data.ts`（renderAllSlides/PDF helper/SlidesStatus の import 元更新）
- Delete: `packages/note-first-presenter/src/config/resolve-slides-path.ts`
- Delete: `packages/note-first-presenter/src/config/__tests__/resolve-slides-path.test.ts`
- Delete: `packages/note-first-presenter/src/node/pdf-renderer.ts`
- Delete: `packages/note-first-presenter/src/node/slide-cache.ts`
- Delete: `packages/note-first-presenter/src/node/slide-filename.ts`
- Delete: `packages/note-first-presenter/src/node/__tests__/pdf-renderer.test.ts`
- Delete: `packages/note-first-presenter/src/node/__tests__/slide-cache.test.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/render-slides.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/render-slides.test.ts`
- Move: `packages/note-first-presenter/src/node/__tests__/fixtures/sample.pdf` → `packages/note-first-presenter/src/__tests__/fixtures/sample.pdf`

- [ ] **Step 1: slides.ts を作成**

`packages/note-first-presenter/src/slides.ts` を作成。中身は次の順で連結:

1. 先頭の import 群(統合後の必要分のみ):

   ```ts
   import { createHash } from 'node:crypto';
   import { existsSync, promises as fs } from 'node:fs';
   import path from 'node:path';
   import { createCanvas } from '@napi-rs/canvas';
   import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
   import { glob } from 'tinyglobby';
   ```

2. **Slides path 解決** — `src/config/resolve-slides-path.ts` の `SlidesStatus`/`ResolveSlidesArgs`/`resolveSlidesPath` をコピー(内部 import なし)。

3. **Slide filename 規約** — `src/node/slide-filename.ts` の `slideFilename` をコピー。

4. **Slide cache path** — `src/node/slide-cache.ts` の `slideCachePath`/`pruneOtherHashes` をコピー。`import { slideFilename } from './slide-filename'` は削除(同ファイル内)。

5. **PDF renderer** — `src/node/pdf-renderer.ts` の全 export(`PageOutOfRangeError`/`resetPdfState`/`ensurePdfState`/`invalidatePdf`/`getSlidesMeta`/`getSlideImage`/`getSlideSize`) と internal(`state` モジュール変数 / `loadAndHash`/`getPdf`/`ensureState`/`encodePage` 等) をコピー。`import { pruneOtherHashes, slideCachePath } from './slide-cache'` は削除(同ファイル内)。

6. **Batch render** — `src/node/pipeline/render-slides.ts` の `RenderedSlide`/`RenderAllResult`/`RenderAllOptions`/`renderAllSlides` をコピー。`import { ensurePdfState, ... } from '../pdf-renderer'` と `import { slideFilename } from '../slide-filename'` は削除(同ファイル内)。

7. **Path helper** — 末尾に追加:

   ```ts
   export function cacheRootFor(cwd: string): string {
     return path.join(cwd, 'node_modules', '.note-first-presenter');
   }
   ```

- [ ] **Step 2: fixtures を移動**

```bash
mkdir -p packages/note-first-presenter/src/__tests__/fixtures
git mv packages/note-first-presenter/src/node/__tests__/fixtures/sample.pdf \
       packages/note-first-presenter/src/__tests__/fixtures/sample.pdf
```

- [ ] **Step 3: slides.test.ts を作成**

`packages/note-first-presenter/src/__tests__/slides.test.ts` を作成。次の test を統合:

- `src/config/__tests__/resolve-slides-path.test.ts` の describe → import 元を `'../slides'` に変更
- `src/node/__tests__/pdf-renderer.test.ts` の describe → import 元を `'../slides'` に変更し、fixture パスを `path.join(__dirname, 'fixtures/sample.pdf')` に修正
- `src/node/__tests__/slide-cache.test.ts` の describe → import 元を `'../slides'` に変更
- `src/node/pipeline/__tests__/render-slides.test.ts` の describe → import 元を `'../slides'` に変更し、fixture パス修正
- 新規 `describe('cacheRootFor')`:

  ```ts
  describe('cacheRootFor', () => {
    it('returns <cwd>/node_modules/.note-first-presenter', () => {
      expect(cacheRootFor('/proj')).toBe('/proj/node_modules/.note-first-presenter');
    });
  });
  ```

- [ ] **Step 4: importers の import パスを更新**

- `src/cli.ts`:
  - `import { resolveSlidesPath } from './config/resolve-slides-path'` → `import { resolveSlidesPath } from './slides'`
  - 既存の `path.join(cwd, 'node_modules', '.note-first-presenter')` 構築箇所(build/export サブコマンド内 2 箇所) を `cacheRootFor(cwd)` に置換し、`import { cacheRootFor, resolveSlidesPath } from './slides'` に集約。

- `src/middleware/api.ts`:
  - `import type { SlidesStatus } from '../config/resolve-slides-path'` → `import type { SlidesStatus } from '../slides'`
  - `import { ensurePdfState, getSlideImage, getSlidesMeta, PageOutOfRangeError } from '../node/pdf-renderer'` → `import { ensurePdfState, getSlideImage, getSlidesMeta, PageOutOfRangeError } from '../slides'`

- `src/plugin/index.ts`:
  - `import { resolveSlidesPath } from '../config/resolve-slides-path'` → `import { resolveSlidesPath } from '../slides'`

- `src/plugin/virtual-modules.ts`:
  - `import type { SlidesStatus } from '../config/resolve-slides-path'` → `import type { SlidesStatus } from '../slides'`
  - `cacheRoot: path.join(input.cwd, 'node_modules', '.note-first-presenter')` を `cacheRoot: cacheRootFor(input.cwd)` に変更し、`import { cacheRootFor } from '../slides'` を追加。同様に `dbPath` を `dbPathFor(input.cwd)` に変更し `import { dbPathFor } from '../notes'` を追加。`path` import は不要になれば削除。

- `src/plugin/file-watchers.ts`:
  - `import type { SlidesStatus } from '../config/resolve-slides-path'` → `import type { SlidesStatus } from '../slides'`

- `src/node/pipeline/export.ts`:
  - `import { renderAllSlides } from './render-slides'` → `import { renderAllSlides } from '../../slides'`

- `src/node/pipeline/build-data.ts`:
  - `import { ensurePdfState, getSlidesMeta } from '../pdf-renderer'` → `import { ensurePdfState, getSlidesMeta, renderAllSlides } from '../../slides'`
  - `import { renderAllSlides } from './render-slides'` の行は削除
  - `import type { SlidesStatus } from '../../config/resolve-slides-path'` → `import type { SlidesStatus } from '../../slides'`

- [ ] **Step 5: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/config/resolve-slides-path.ts
rm packages/note-first-presenter/src/config/__tests__/resolve-slides-path.test.ts
rm packages/note-first-presenter/src/node/pdf-renderer.ts
rm packages/note-first-presenter/src/node/slide-cache.ts
rm packages/note-first-presenter/src/node/slide-filename.ts
rm packages/note-first-presenter/src/node/__tests__/pdf-renderer.test.ts
rm packages/note-first-presenter/src/node/__tests__/slide-cache.test.ts
rm packages/note-first-presenter/src/node/pipeline/render-slides.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/render-slides.test.ts
rmdir packages/note-first-presenter/src/node/__tests__/fixtures
```

- [ ] **Step 6: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): consolidate Slides entity into src/slides.ts"
```

---

## Task 3: Config エンティティ作成

**Files:**

- Create: `packages/note-first-presenter/src/config.ts`
- Create: `packages/note-first-presenter/src/__tests__/config.test.ts`
- Modify: `packages/note-first-presenter/src/index.ts`（型の import 元更新）
- Modify: `packages/note-first-presenter/src/cli.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/plugin/index.ts`（import パス更新）
- Modify: `packages/note-first-presenter/src/plugin/virtual-modules.ts`（型の import 元更新）
- Modify: `packages/note-first-presenter/src/vite/config.ts`（型の import 元更新、現状 `'../plugin'` 経由なので確認）
- Delete: `packages/note-first-presenter/src/config/schema.ts`
- Delete: `packages/note-first-presenter/src/config/defaults.ts`
- Delete: `packages/note-first-presenter/src/config/load-config.ts`
- Delete: `packages/note-first-presenter/src/config/__tests__/defaults.test.ts`
- Delete: `packages/note-first-presenter/src/config/__tests__/load-config.test.ts`
- Delete: `packages/note-first-presenter/src/config/`（ディレクトリごと、Step 5 で）

- [ ] **Step 1: config.ts を作成**

`packages/note-first-presenter/src/config.ts` を作成。中身は次の順で連結:

1. 先頭の import 群:

   ```ts
   import { existsSync } from 'node:fs';
   import path from 'node:path';
   import * as v from 'valibot';
   import { loadConfigFromFile } from 'vite';
   ```

2. **Schema** — `src/config/schema.ts` の `configSchema`/`NoteFirstPresenterConfig` をコピー。

3. **Loader** — `src/config/load-config.ts` の `CONFIG_NAMES` 定数と `loadNfpConfig` をコピー。`import { configSchema, type NoteFirstPresenterConfig } from './schema'` は削除(同ファイル内)。

4. **Resolved options** — `src/config/defaults.ts` の `BuildOptions`/`ResolveBuildArgs`/`resolveBuildOptions`/`ExportOptions`/`ResolveExportArgs`/`resolveExportOptions` をコピー。`import type { NoteFirstPresenterConfig } from './schema'` は削除(同ファイル内)。

- [ ] **Step 2: config.test.ts を作成**

`packages/note-first-presenter/src/__tests__/config.test.ts` を作成。次の test を統合:

- `src/config/__tests__/defaults.test.ts` の describe → import 元を `'../config'` に変更
- `src/config/__tests__/load-config.test.ts` の describe → import 元を `'../config'` に変更

- [ ] **Step 3: importers の import パスを更新**

- `src/index.ts`:
  - `import type { NoteFirstPresenterConfig } from './config/schema'` → `import type { NoteFirstPresenterConfig } from './config'`

- `src/cli.ts`:
  - `import { resolveBuildOptions, resolveExportOptions } from './config/defaults'` と `import { loadNfpConfig } from './config/load-config'` を `import { loadNfpConfig, resolveBuildOptions, resolveExportOptions } from './config'` に統合。

- `src/plugin/index.ts`:
  - `import { loadNfpConfig } from '../config/load-config'` → `import { loadNfpConfig } from '../config'`

- `src/plugin/virtual-modules.ts`:
  - `import type { NoteFirstPresenterConfig } from '../config/schema'` → `import type { NoteFirstPresenterConfig } from '../config'`

- `src/vite/config.ts`: 直接の依存はないが、`NfpPluginOptions` 経由で型が流れているため、`vp check` を通して確認のみ。

- [ ] **Step 4: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/config/schema.ts
rm packages/note-first-presenter/src/config/defaults.ts
rm packages/note-first-presenter/src/config/load-config.ts
rm packages/note-first-presenter/src/config/__tests__/defaults.test.ts
rm packages/note-first-presenter/src/config/__tests__/load-config.test.ts
rmdir packages/note-first-presenter/src/config/__tests__
rmdir packages/note-first-presenter/src/config
```

- [ ] **Step 5: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A packages/note-first-presenter/src/ packages/note-first-presenter/src/index.ts
git commit -m "refactor(nfp): consolidate Config entity into src/config.ts"
```

---

## Task 4: `commands/shared.ts` を作成

**Files:**

- Create: `packages/note-first-presenter/src/commands/shared.ts`
- Modify: `packages/note-first-presenter/src/cli.ts`（`resolveClientRoot` を commands/shared から import）
- Modify: `packages/note-first-presenter/src/vite/config.ts`（後続 Task 9 で削除予定、ここでは現状維持）

- [ ] **Step 1: commands/shared.ts を作成**

`packages/note-first-presenter/src/commands/shared.ts` を作成:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { InlineConfig } from 'vite';
import { findClosestPkgJsonPath } from 'vitefu';
import type { NoteFirstPresenterConfig } from '../config';
import type { SlidesStatus } from '../slides';
import { noteFirstPresenterPlugin } from '../plugin';

export async function resolveClientRoot(): Promise<string> {
  const clientPkgJsonStart = path.dirname(
    fileURLToPath(import.meta.resolve('@note-first-presenter/client/package.json')),
  );
  const clientPkgJson = await findClosestPkgJsonPath(clientPkgJsonStart);
  if (!clientPkgJson) throw new Error('Cannot resolve @note-first-presenter/client');
  return path.dirname(clientPkgJson);
}

export interface CreateViteConfigInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  mode: 'dev' | 'build';
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig(input: CreateViteConfigInput): InlineConfig {
  const { clientRoot, isStatic, outDir, cwd, slidesStatus, fullConfig, mode } = input;
  return {
    root: clientRoot,
    configFile: false,
    appType: 'spa',
    resolve: {
      alias: {
        $lib: path.join(clientRoot, 'src/lib'),
      },
    },
    define: {
      __NFP_STATIC__: JSON.stringify(isStatic),
    },
    plugins: [
      svelte(),
      paraglideVitePlugin({
        project: path.join(clientRoot, 'project.inlang'),
        outdir: path.join(clientRoot, 'src/lib/paraglide'),
        strategy: ['preferredLanguage', 'baseLocale'],
      }),
      noteFirstPresenterPlugin({ cwd, slidesStatus, fullConfig, mode }),
    ],
    build: outDir ? { outDir, emptyOutDir: true } : undefined,
  };
}
```

(現状 `src/vite/config.ts` の `createViteConfig` と同等の内容で、`resolveClientRoot` は cli.ts から抽出)

- [ ] **Step 2: cli.ts の `resolveClientRoot` 局所定義を撤去し、import に置換**

`src/cli.ts` の `async function resolveClientRoot()` 関数定義(現在 21-28 行付近)を削除し、ファイル先頭の import 群に `import { resolveClientRoot } from './commands/shared'` を追加。`import { findClosestPkgJsonPath } from 'vitefu'` と `import { fileURLToPath } from 'node:url'` を cli.ts から削除。

cli.ts の他の `createViteConfig` import はこの Task では触らない(Task 5-7 で commands/X.ts に移すため)。

- [ ] **Step 3: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/note-first-presenter/src/commands/shared.ts \
        packages/note-first-presenter/src/cli.ts
git commit -m "refactor(nfp): extract resolveClientRoot/createViteConfig to commands/shared"
```

---

## Task 5: `commands/dev.ts` を作成し cli.ts dev を委譲

**Files:**

- Create: `packages/note-first-presenter/src/commands/dev.ts`
- Modify: `packages/note-first-presenter/src/cli.ts`（dev サブコマンドの run を `createServer` 呼び出しに置換）

- [ ] **Step 1: commands/dev.ts を作成**

`packages/note-first-presenter/src/commands/dev.ts`:

```ts
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import type { NoteFirstPresenterConfig } from '../config';
import type { SlidesStatus } from '../slides';
import { createViteConfig } from './shared';

export interface CreateServerInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  clientRoot: string;
  port: number;
  host: string;
  open: boolean;
}

export async function createServer(input: CreateServerInput): Promise<ViteDevServer> {
  return await createViteServer({
    ...createViteConfig({
      cwd: input.cwd,
      slidesStatus: input.slidesStatus,
      fullConfig: input.fullConfig,
      mode: 'dev',
      clientRoot: input.clientRoot,
      isStatic: false,
    }),
    server: {
      port: input.port,
      host: input.host,
      open: input.open ? '/' : false,
    },
  });
}
```

- [ ] **Step 2: cli.ts の dev サブコマンドを委譲形に書き換え**

`src/cli.ts` の `const dev = defineCommand({...})` の `run` 本体を次に置換:

```ts
async run({ args }) {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });

  const clientRoot = await resolveClientRoot();
  process.chdir(clientRoot);

  const { createServer } = await import('./commands/dev');
  const server = await createServer({
    cwd,
    slidesStatus,
    fullConfig: config,
    clientRoot,
    port: Number(args.port),
    host: args.host,
    open: args.open,
  });

  await server.listen();
  server.printUrls();

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
},
```

cli.ts 先頭の `import { createServer } from 'vite'`(直接 import している場合)を削除し、`viteBuild`(後の Task で使う)以外の Vite 直接 import を整理。

- [ ] **Step 3: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/note-first-presenter/src/commands/dev.ts packages/note-first-presenter/src/cli.ts
git commit -m "refactor(nfp): split dev command into commands/dev.ts"
```

---

## Task 6: `commands/build.ts` を作成し cli.ts build を委譲（writeBuildData inline）

**Files:**

- Create: `packages/note-first-presenter/src/commands/build.ts`
- Create: `packages/note-first-presenter/src/commands/__tests__/build.test.ts`
- Modify: `packages/note-first-presenter/src/cli.ts`（build サブコマンドの run を `build` 呼び出しに置換）
- Delete: `packages/note-first-presenter/src/node/pipeline/build-data.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/build-data.test.ts`

- [ ] **Step 1: commands/build.ts を作成**

`packages/note-first-presenter/src/commands/build.ts`:

```ts
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import type { NoteFirstPresenterConfig } from '../config';
import { dbPathFor, readDb } from '../notes';
import {
  cacheRootFor,
  ensurePdfState,
  getSlidesMeta,
  renderAllSlides,
  type SlidesStatus,
} from '../slides';
import { createViteConfig } from './shared';

export interface BuildInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  clientRoot: string;
  outDir: string;
}

export async function build(input: BuildInput): Promise<void> {
  const { cwd, slidesStatus, fullConfig, clientRoot, outDir } = input;

  await viteBuild(
    createViteConfig({
      cwd,
      slidesStatus,
      fullConfig,
      mode: 'build',
      clientRoot,
      isStatic: true,
      outDir,
    }),
  );

  await copyFile(path.join(outDir, 'index.html'), path.join(outDir, '200.html'));

  await writeBuildData({
    outDir,
    dbPath: dbPathFor(cwd),
    cacheRoot: cacheRootFor(cwd),
    slidesStatus,
  });
}

interface WriteBuildDataOptions {
  outDir: string;
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

async function writeBuildData(opts: WriteBuildDataOptions): Promise<void> {
  const dataDir = path.join(opts.outDir, 'nfp-data');
  await mkdir(dataDir, { recursive: true });

  const db = await readDb(opts.dbPath);
  await writeFile(path.join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');

  if (opts.slidesStatus.kind !== 'resolved') {
    await writeFile(path.join(dataDir, 'meta.json'), JSON.stringify(opts.slidesStatus), 'utf8');
    return;
  }

  ensurePdfState({ slidesPath: opts.slidesStatus.path, cacheRoot: opts.cacheRoot });
  const { hash } = await getSlidesMeta();
  const slidesDir = path.join(dataDir, 'slides', hash);
  const { promises: fs } = await import('node:fs');
  await fs.rm(slidesDir, { recursive: true, force: true });
  const rendered = await renderAllSlides({
    slidesPath: opts.slidesStatus.path,
    cacheRoot: opts.cacheRoot,
    outDir: slidesDir,
  });
  await writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ status: 'resolved', hash: rendered.hash, pageCount: rendered.pageCount }),
    'utf8',
  );
}

export { writeBuildData };
```

注: `writeBuildData` は隣接テストから直接呼ぶため `export` を維持する。

- [ ] **Step 2: commands/\_\_tests\_\_/build.test.ts を作成**

`src/node/pipeline/__tests__/build-data.test.ts` の `describe('writeBuildData', ...)` ブロックをそのまま移動し、import を `import { writeBuildData } from '../build'` に変更。fixtures パスがあれば `__tests__/fixtures/sample.pdf` を参照するよう更新。

- [ ] **Step 3: cli.ts の build サブコマンドを委譲形に書き換え**

`src/cli.ts` の `const build = defineCommand({...})` の `run` 本体を次に置換:

```ts
async run({ args }) {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  const { outDir } = resolveBuildOptions({
    cwd,
    config,
    flags: { outDir: args['out-dir'] },
  });

  const clientRoot = await resolveClientRoot();
  process.chdir(clientRoot);

  const { build } = await import('./commands/build');
  await build({ cwd, slidesStatus, fullConfig: config, clientRoot, outDir });

  console.log(`Built static site to ${outDir}`);
},
```

cli.ts から `import { build as viteBuild } from 'vite'`、`import { copyFile } from 'node:fs/promises'`、`import { writeBuildData } from './node/pipeline/build-data'` を削除。

- [ ] **Step 4: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/node/pipeline/build-data.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/build-data.test.ts
```

- [ ] **Step 5: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): split build command into commands/build.ts"
```

---

## Task 7: `commands/export.ts` を作成し cli.ts export を委譲（pipeline inline）

**Files:**

- Create: `packages/note-first-presenter/src/commands/export.ts`
- Create: `packages/note-first-presenter/src/commands/__tests__/export.test.ts`
- Modify: `packages/note-first-presenter/src/cli.ts`（export サブコマンドの run を `exportPage` 呼び出しに置換）
- Delete: `packages/note-first-presenter/src/node/pipeline/export.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/context.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/format.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/default-template.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/types.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/export.test.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/context.test.ts`
- Delete: `packages/note-first-presenter/src/node/pipeline/__tests__/format.test.ts`

- [ ] **Step 1: commands/export.ts を作成**

`packages/note-first-presenter/src/commands/export.ts` の内容(連結方針):

1. 先頭 import:

   ```ts
   import { existsSync, promises as fs } from 'node:fs';
   import path from 'node:path';
   import { Eta } from 'eta';
   import { dbPathFor, readDb, splitNoteGroups, type NoteNode } from '../notes';
   import {
     cacheRootFor,
     renderAllSlides,
     type RenderAllResult,
     type SlidesStatus,
   } from '../slides';
   ```

2. **Types** — 旧 `node/pipeline/types.ts` の `ExportSlide`/`ExportContext`(NoteNode 参照は `notes.ts` から):

   ```ts
   export interface ExportSlide {
     number: number;
     image: string | null;
     width: number;
     height: number;
     notes: NoteNode[];
   }

   export interface ExportContext {
     title: string;
     slideCount: number;
     slides: ExportSlide[];
     toMarkdown: (notes: NoteNode[]) => string;
     toHtml: (notes: NoteNode[]) => string;
   }
   ```

3. **Format helpers** — 旧 `node/pipeline/format.ts` の `toMarkdown`/`escapeHtml`/`toHtml` をコピー。`escapeHtml` は internal のまま、`toMarkdown`/`toHtml` は export する(test から呼ぶ)。

4. **Context builder** — 旧 `node/pipeline/context.ts` の `BuildContextOptions`/`buildExportContext` をコピー。`toHtml`/`toMarkdown` は同ファイル内参照。

5. **Default template** — 旧 `node/pipeline/default-template.ts` の `DEFAULT_TEMPLATE` 定数をコピー。

6. **Pipeline body + entry** — 旧 `node/pipeline/export.ts` の `PipelineExportOptions`/`runPipelineExport` をコピーしつつ、entry 関数を改名:

   ```ts
   export interface ExportPageInput {
     slidesStatus: SlidesStatus;
     cwd: string;
     outDir: string;
     imageDir: string;
     imageRelDir: string;
     templatePath: string | null;
     extension: string;
     name: string;
   }

   export async function exportPage(input: ExportPageInput): Promise<string> {
     if (input.slidesStatus.kind !== 'resolved') {
       throw new Error(`slides not available: ${input.slidesStatus.kind}`);
     }
     return runPipelineExport({
       slidesPath: input.slidesStatus.path,
       dbPath: dbPathFor(input.cwd),
       cacheRoot: cacheRootFor(input.cwd),
       outDir: input.outDir,
       imageDir: input.imageDir,
       imageRelDir: input.imageRelDir,
       templatePath: input.templatePath,
       extension: input.extension,
       name: input.name,
     });
   }
   ```

   `runPipelineExport` 自体は同ファイル内に internal で残し、`renderAllSlides`/`readDb`/`splitNoteGroups`/`buildExportContext`/`DEFAULT_TEMPLATE` への参照は同ファイル内に解決される。

- [ ] **Step 2: commands/\_\_tests\_\_/export.test.ts を作成**

3 つの test を順に統合:

- 旧 `node/pipeline/__tests__/format.test.ts` の `describe('toMarkdown'/'toHtml')` → import 元を `'../export'` に変更
- 旧 `node/pipeline/__tests__/context.test.ts` の `describe('buildExportContext')` → import 元を `'../export'` に、`NoteNode` 型は `'../../notes'` から
- 旧 `node/pipeline/__tests__/export.test.ts` の `describe('runPipelineExport')` → entry を `exportPage` に置換し、`import { exportPage } from '../export'`。test 内の呼出は `exportPage({ slidesStatus: { kind: 'resolved', path: ... }, cwd, ...rest })` 形式に書き換える(`dbPath`/`cacheRoot` は `cwd` から自動で導出される)。テストの fixture パス参照は `__tests__/fixtures/sample.pdf` に修正。`runPipelineExport` は internal のまま export しない。

- [ ] **Step 3: cli.ts の export サブコマンドを委譲形に書き換え**

`src/cli.ts` の `const export_ = defineCommand({...})` の `run` 本体を次に置換:

```ts
async run({ args }) {
  const cwd = process.cwd();
  const { config, filePath } = await loadNfpConfig(cwd);
  const slidesStatus = await resolveSlidesPath({
    cwd,
    configuredSlides: config?.slides,
    configFile: filePath,
  });
  if (slidesStatus.kind !== 'resolved') {
    throw new Error(`slides not available: ${slidesStatus.kind}`);
  }
  const opts = resolveExportOptions({
    cwd,
    config,
    flags: {
      outDir: args['out-dir'],
      imageDir: args['image-dir'],
      template: args.template,
    },
  });
  const name = path.basename(slidesStatus.path, path.extname(slidesStatus.path)) || 'notes';

  const { exportPage } = await import('./commands/export');
  const outFile = await exportPage({
    slidesStatus,
    cwd,
    outDir: opts.outDir,
    imageDir: opts.imageDir,
    imageRelDir: opts.imageRelDir,
    templatePath: opts.templatePath,
    extension: opts.extension,
    name,
  });
  console.log(`Exported to ${outFile}`);
},
```

cli.ts から `import { runPipelineExport } from './node/pipeline/export'` を削除。`import path from 'node:path'` は basename 呼出のため残す。

- [ ] **Step 4: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/node/pipeline/export.ts
rm packages/note-first-presenter/src/node/pipeline/context.ts
rm packages/note-first-presenter/src/node/pipeline/format.ts
rm packages/note-first-presenter/src/node/pipeline/default-template.ts
rm packages/note-first-presenter/src/node/pipeline/types.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/export.test.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/context.test.ts
rm packages/note-first-presenter/src/node/pipeline/__tests__/format.test.ts
rmdir packages/note-first-presenter/src/node/pipeline/__tests__
rmdir packages/note-first-presenter/src/node/pipeline
```

これで `src/node/pipeline/` は空、`src/node/` には `__tests__/` のみ残る(中身は空のはず)。

- [ ] **Step 5: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): split export command into commands/export.ts"
```

---

## Task 8: `vite/api.ts` と `vite/watchers.ts` を作成（旧 middleware/plugin から移設）

**Files:**

- Create: `packages/note-first-presenter/src/vite/api.ts`
- Create: `packages/note-first-presenter/src/vite/watchers.ts`
- Create: `packages/note-first-presenter/src/vite/__tests__/api.test.ts`
- Modify: `packages/note-first-presenter/src/plugin/index.ts`（import パス更新、後続 Task 9 で全削除予定）
- Delete: `packages/note-first-presenter/src/middleware/api.ts`
- Delete: `packages/note-first-presenter/src/middleware/__tests__/api.test.ts`
- Delete: `packages/note-first-presenter/src/plugin/file-watchers.ts`

- [ ] **Step 1: vite/api.ts を作成**

`src/middleware/api.ts` の中身をそのまま `src/vite/api.ts` にコピー。先頭の import 文 `import type { SlidesStatus } from '../slides'` と `import { readDb, writeDb, dbInputSchema } from '../notes'` と `import { ensurePdfState, getSlideImage, getSlidesMeta, PageOutOfRangeError } from '../slides'` は相対パス変更なし(`../` のまま、vite/ 配下からは `../notes`/`../slides`)。

- [ ] **Step 2: vite/watchers.ts を作成**

`src/plugin/file-watchers.ts` の中身をそのまま `src/vite/watchers.ts` にコピー。`import type { SlidesStatus } from '../slides'` のまま(vite/ も plugin/ も親が src なので相対は同じ)。

- [ ] **Step 3: vite/\_\_tests\_\_/api.test.ts を作成**

`src/middleware/__tests__/api.test.ts` を `src/vite/__tests__/api.test.ts` に移動。import 文を更新:

- `import type { SlidesStatus } from '../../config/resolve-slides-path'` → `import type { SlidesStatus } from '../../slides'`
- `import { type ApiContext, createApiMiddleware } from '../api'`(変更なし)

- [ ] **Step 4: plugin/index.ts の import 更新**

`src/plugin/index.ts` の `import { createApiMiddleware } from '../middleware/api'` を `import { createApiMiddleware } from '../vite/api'` に、`import { initFileWatchers } from './file-watchers'` を `import { initFileWatchers } from '../vite/watchers'` に変更。

- [ ] **Step 5: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/middleware/api.ts
rm packages/note-first-presenter/src/middleware/__tests__/api.test.ts
rmdir packages/note-first-presenter/src/middleware/__tests__
rmdir packages/note-first-presenter/src/middleware
rm packages/note-first-presenter/src/plugin/file-watchers.ts
```

- [ ] **Step 6: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): move api/watchers helpers into vite/"
```

---

## Task 9: `vite/plugin.ts` + `vite/index.ts` を再構成（vite/config.ts 廃止）

**Files:**

- Create: `packages/note-first-presenter/src/vite/plugin.ts`
- Modify: `packages/note-first-presenter/src/vite/index.ts`（plugin 配列を返す関数に書き換え）
- Modify: `packages/note-first-presenter/src/commands/shared.ts`（vite/index.ts の関数を使うよう createViteConfig を書き換え）
- Delete: `packages/note-first-presenter/src/vite/config.ts`
- Delete: `packages/note-first-presenter/src/plugin/index.ts`
- Delete: `packages/note-first-presenter/src/plugin/virtual-modules.ts`
- Delete: `packages/note-first-presenter/src/plugin/__tests__/virtual-modules.test.ts`

- [ ] **Step 1: vite/plugin.ts を作成**

`src/plugin/index.ts` の `noteFirstPresenterPlugin`/`NfpPluginOptions` のロジックを `src/vite/plugin.ts` に移し、`buildRuntimeConfigObject` の呼出を `dbPathFor`/`cacheRootFor` の直接呼出に書き換える:

```ts
import type { Plugin } from 'vite';
import type { NoteFirstPresenterConfig } from '../config';
import { loadNfpConfig, resolveBuildOptions, resolveExportOptions } from '../config';
import { cacheRootFor, resolveSlidesPath, type SlidesStatus } from '../slides';
import { dbPathFor } from '../notes';
import { createApiMiddleware } from './api';
import { initFileWatchers } from './watchers';

export interface NfpPluginOptions {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  mode: 'dev' | 'build';
}

export function ViteNfpPlugin(opts: NfpPluginOptions): Plugin {
  let current = opts;
  let closeWatchers: (() => Promise<void>) | null = null;
  return {
    name: 'note-first-presenter',
    configureServer(server) {
      server.middlewares.use(
        createApiMiddleware(() => ({
          dbPath: dbPathFor(current.cwd),
          cacheRoot: cacheRootFor(current.cwd),
          slidesStatus: current.slidesStatus,
        })),
      );
      closeWatchers = initFileWatchers({
        cwd: current.cwd,
        slidesStatus: current.slidesStatus,
        vite: server,
        onChange: async () => {
          const { config, filePath } = await loadNfpConfig(current.cwd);
          const slidesStatus = await resolveSlidesPath({
            cwd: current.cwd,
            configuredSlides: config?.slides,
            configFile: filePath,
          });
          current = { ...current, fullConfig: config, slidesStatus };
          server.ws.send({ type: 'full-reload' });
        },
      });
    },
    async closeBundle() {
      await closeWatchers?.();
    },
  };
}
```

注: `resolveBuildOptions`/`resolveExportOptions` の import は実際の使用箇所に応じて削る。上記のロジックでは未使用なので不要。

- [ ] **Step 2: vite/index.ts を作成**

`packages/note-first-presenter/src/vite/index.ts`:

```ts
import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { PluginOption } from 'vite';
import { ViteNfpPlugin, type NfpPluginOptions } from './plugin';

export interface NfpVitePluginsInput extends NfpPluginOptions {
  clientRoot: string;
}

export function createNfpVitePlugins(input: NfpVitePluginsInput): PluginOption[] {
  const { clientRoot, ...nfp } = input;
  return [
    svelte(),
    paraglideVitePlugin({
      project: path.join(clientRoot, 'project.inlang'),
      outdir: path.join(clientRoot, 'src/lib/paraglide'),
      strategy: ['preferredLanguage', 'baseLocale'],
    }),
    ViteNfpPlugin(nfp),
  ];
}
```

- [ ] **Step 3: commands/shared.ts の `createViteConfig` を書き換え**

`packages/note-first-presenter/src/commands/shared.ts` の `createViteConfig` 内 `plugins: [svelte(), paraglideVitePlugin(...), noteFirstPresenterPlugin(...)]` を `plugins: createNfpVitePlugins({ clientRoot, cwd, slidesStatus, fullConfig, mode })` に置換。ファイル先頭の import を整理:

- 削除: `import { paraglideVitePlugin } from '@inlang/paraglide-js'`
- 削除: `import { svelte } from '@sveltejs/vite-plugin-svelte'`
- 削除: `import { noteFirstPresenterPlugin } from '../plugin'`
- 追加: `import { createNfpVitePlugins } from '../vite'`

`createViteConfig` 内の `resolve.alias.$lib` と `define.__NFP_STATIC__` の生成、`build` オプションは残す。

- [ ] **Step 4: 旧ファイルを削除**

```bash
rm packages/note-first-presenter/src/vite/config.ts
rm packages/note-first-presenter/src/plugin/index.ts
rm packages/note-first-presenter/src/plugin/virtual-modules.ts
rm packages/note-first-presenter/src/plugin/__tests__/virtual-modules.test.ts
rmdir packages/note-first-presenter/src/plugin/__tests__
rmdir packages/note-first-presenter/src/plugin
```

`virtual-modules.test.ts` の `dbPathFor`/`cacheRootFor` テストは Task 1/Task 2 で notes/slides の test に既に統合済みなので削除して問題ない。

- [ ] **Step 5: 検証**

Run: `vp check`
Expected: PASS

Run: `vp test -F note-first-presenter`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): reorganize vite plugins under vite/{index,plugin}.ts"
```

---

## Task 10: クリーンアップと最終検証

**Files:**

- Delete(残骸があれば): `packages/note-first-presenter/src/node/`、`src/middleware/`、`src/plugin/`

- [ ] **Step 1: 旧ディレクトリの残骸を削除**

```bash
ls -laR packages/note-first-presenter/src/node packages/note-first-presenter/src/middleware packages/note-first-presenter/src/plugin packages/note-first-presenter/src/config 2>/dev/null || true
```

残ファイルがあれば原因を調査(import パス未更新の可能性)。空ディレクトリのみの場合:

```bash
rmdir packages/note-first-presenter/src/node/__tests__ 2>/dev/null || true
rmdir packages/note-first-presenter/src/node 2>/dev/null || true
rmdir packages/note-first-presenter/src/middleware 2>/dev/null || true
rmdir packages/note-first-presenter/src/plugin 2>/dev/null || true
rmdir packages/note-first-presenter/src/config 2>/dev/null || true
```

- [ ] **Step 2: 最終的なファイル構成を確認**

Run: `find packages/note-first-presenter/src -type f | sort`

Expected: 次のファイルのみ存在すること(順不同):

```
packages/note-first-presenter/src/__tests__/build-integration.test.ts
packages/note-first-presenter/src/__tests__/config.test.ts
packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts
packages/note-first-presenter/src/__tests__/fixtures/sample.pdf
packages/note-first-presenter/src/__tests__/notes.test.ts
packages/note-first-presenter/src/__tests__/slides.test.ts
packages/note-first-presenter/src/cli.ts
packages/note-first-presenter/src/commands/__tests__/build.test.ts
packages/note-first-presenter/src/commands/__tests__/export.test.ts
packages/note-first-presenter/src/commands/build.ts
packages/note-first-presenter/src/commands/dev.ts
packages/note-first-presenter/src/commands/export.ts
packages/note-first-presenter/src/commands/shared.ts
packages/note-first-presenter/src/config.ts
packages/note-first-presenter/src/index.ts
packages/note-first-presenter/src/notes.ts
packages/note-first-presenter/src/slides.ts
packages/note-first-presenter/src/vite/__tests__/api.test.ts
packages/note-first-presenter/src/vite/api.ts
packages/note-first-presenter/src/vite/index.ts
packages/note-first-presenter/src/vite/plugin.ts
packages/note-first-presenter/src/vite/watchers.ts
```

- [ ] **Step 3: pack（バンドル）と check/test を再実行**

Run: `vp pack -F note-first-presenter`
Expected: PASS（dist の生成が成功）

Run: `vp check`
Expected: PASS

Run: `vp test`
Expected: PASS（全 workspace）

- [ ] **Step 4: e2e を実行**

Run: `vp run --filter e2e e2e` 相当のコマンド(プロジェクトの e2e スクリプトに従う。`package.json` の `scripts` を参照し、Playwright を起動する手順を踏む)。

Expected: 既存テストが全 PASS(client/server リアーキ時の flaky 既知問題がある場合は spec に記載のものに限る)。

- [ ] **Step 5: Commit（残骸削除のみ、差分が無ければスキップ）**

```bash
git status
```

差分がある場合のみ:

```bash
git add -A packages/note-first-presenter/src/
git commit -m "refactor(nfp): drop empty legacy directories"
```

---

## 完了基準

- [ ] `find packages/note-first-presenter/src -type f` の結果が File Structure 節と一致する。
- [ ] `vp check` / `vp test` が全 workspace で PASS。
- [ ] `vp pack -F note-first-presenter` が PASS。
- [ ] e2e が PASS(既知 flaky を除く)。
- [ ] `git log --oneline` で各 Task が独立コミットとして残っている。
- [ ] 公開 API(`defineConfig` と `bin/note-first-presenter.mjs` のサブコマンド)に変更が無いこと。
