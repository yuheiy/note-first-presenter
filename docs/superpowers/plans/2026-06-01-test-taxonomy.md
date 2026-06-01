# テスト層の再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vitest と Playwright の責務境界を明文化し、層ごとに別 vitest config（unit / component / cli-integration）を立て、Svelte コンポーネント／ストア／sync の空白 6 ファイルを追加、重複する e2e 3 件と per-file env directive を削除する。

**Architecture:** 仕様 `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md` の通り 4 層構造（unit / component / cli-integration / e2e）。層はファイル名で一意決定。**仕様 R1 フォールバック採用**：vitest 4.1 の `test.projects` は `vite-plus/test` shim と worker module graph で衝突して走らないため、層ごとに別 config ファイル（`vite.config.ts` / `vitest.browser.config.ts` / `vitest.cli.config.ts`）に分割し、`vp test -c <path>` で起動する。設計の核（ファイル名で層決定、追加/削除すべきテスト一覧）は不変。

**Tech Stack:** vite-plus（vitest 4 / oxlint / oxfmt）、`@vitest/browser-playwright` 4.1、`vitest-browser-svelte` 2.1、happy-dom 20、Svelte 5（runes）、Playwright 1.60。

**前提:** `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md` が main にコミット済み（commit 88f1f0b）。`pnpm-lock.yaml` 上で必要な依存はすべて解決済み（追加 `npm` パッケージは不要）。

---

## File Structure

### 新規作成

- `packages/client/vite.config.ts` — client パッケージの vitest 設定（unit / component の 2 project）
- `packages/note-first-presenter/test/__fixtures__/sample.pdf` — `src/__tests__/fixtures/sample.pdf` から移動
- `packages/note-first-presenter/test/_helpers/use-temp-cwd.ts` — `src/__tests__/use-temp-cwd.ts` から移動
- `packages/note-first-presenter/test/cli/build.cli.test.ts` — `src/__tests__/build-integration.test.ts` から移動・改名
- `packages/note-first-presenter/test/cli/export.cli.test.ts` — `src/__tests__/export-bin-integration.test.ts` から移動・改名
- `packages/note-first-presenter/test/cli/setup-pack.ts` — vp pack を 1 回だけ実行する globalSetup
- `packages/client/src/lib/active-slide/__tests__/active-slide-store.test.ts`
- `packages/client/src/lib/slides-meta/__tests__/slides-meta-store.test.ts`
- `packages/client/src/lib/db/__tests__/db-client.test.ts`
- `packages/client/src/lib/theme/__tests__/theme-store.test.ts`
- `packages/client/src/lib/sync/__tests__/sync-publisher.test.ts`
- `packages/client/src/lib/sync/__tests__/sync-subscriber.test.ts`
- `packages/client/src/lib/slide-status/__tests__/SlideListErrorOverlay.browser.test.ts`
- `packages/client/src/lib/slide-status/__tests__/SlideListHint.browser.test.ts`
- `packages/client/src/lib/slide-status/__tests__/SlideshowFallback.browser.test.ts`
- `packages/client/src/lib/slide-image/__tests__/SlideImage.browser.test.ts`

### 変更

- `packages/note-first-presenter/vite.config.ts` — 既存 `pack`/`lint`/`fmt` に `test`（unit 用）を追記
- `packages/note-first-presenter/package.json` — `test` スクリプトは既存 `vp test` のまま維持（unit のみ走る）
- `packages/client/package.json` — `test` スクリプトを `vp test && vp test -c vitest.browser.config.ts` に変更（Task 5 で）
- `package.json`（root）— `test:cli` 追加（`vp test -c vitest.cli.config.ts`）、`ready` を再定義
- `packages/note-first-presenter/src/__tests__/db.test.ts` 他 4 ファイル — `use-temp-cwd` の import パスと fixture path を更新
- `packages/note-first-presenter/src/__tests__/slides.test.ts` — fixture path 更新
- `packages/note-first-presenter/src/commands/__tests__/build.test.ts` — fixture path と use-temp-cwd import 更新
- `packages/note-first-presenter/src/commands/__tests__/export.test.ts` — fixture path と use-temp-cwd import 更新
- `packages/client/src/lib/outliner/__tests__/paste.test.ts` — 先頭行の `// @vitest-environment happy-dom` を削除
- `e2e/outliner-range.e2e.ts` — 3 テストケースを削除
- `CLAUDE.md` — `<!--VITE PLUS END-->` の下に Testing layers セクションを追記

### 削除（移設に伴う消滅）

- `packages/note-first-presenter/src/__tests__/build-integration.test.ts`（→ test/cli へ移設）
- `packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts`（→ test/cli へ移設）
- `packages/note-first-presenter/src/__tests__/use-temp-cwd.ts`（→ test/\_helpers へ移設）
- `packages/note-first-presenter/src/__tests__/fixtures/sample.pdf`（→ test/\_\_fixtures\_\_ へ移設）
- `packages/note-first-presenter/src/__tests__/fixtures/`（空ディレクトリ削除）

---

## Task 1: vitest workspaces 設定基盤

**Goal:** 各パッケージに `vite.config.ts` を整え、`test` ブロックを「unit 専用」設定として確立する。仕様 R1 のフォールバック構成のため `test.projects` は使わず、component / cli の config は別ファイルで後の Task で追加する。既存テストがすべて緑のまま新 include glob 経由で走ることを確認する。

**Files:**

- Create: `packages/client/vite.config.ts`
- Modify: `packages/note-first-presenter/vite.config.ts`
- Modify: `packages/note-first-presenter/package.json:30`
- Modify: `packages/client/package.json:28`

- [ ] **Step 1: client の vite.config.ts を新規作成**

`packages/client/vite.config.ts` を作成:

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
    ],
  },
});
```

> 注: 本タスクでは component project はまだ追加しない（Task 5 で追加して検証）。
> 既存 client tests は `src/lib/__tests__/runtime-mode.{dev,build}.test.ts` と `src/lib/outliner/__tests__/*.test.ts`。すべて `src/**/__tests__/*.test.ts` にマッチする。

- [ ] **Step 2: nfp の vite.config.ts に test ブロックを追加**

`packages/note-first-presenter/vite.config.ts` を編集（既存の `pack`/`lint`/`fmt` ブロックには触れず、末尾に `test` ブロックを追加）:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/cli.ts'],
    dts: { tsgo: true },
    exports: { exclude: ['cli'] },
    deps: {
      neverBundle: /node_modules/,
    },
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: { ignorePatterns: ['dist/**'] },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/__tests__/*.test.ts'],
        },
      },
    ],
  },
});
```

> 注: cli project は Task 3 で追加する。

- [ ] **Step 3: nfp の package.json の test スクリプトを更新**

`packages/note-first-presenter/package.json` の `"test"` を以下に変更:

```json
"test": "vp test",
```

- [ ] **Step 4: client の package.json の test スクリプトを更新**

`packages/client/package.json` の `"test"` を以下に変更（component は Task 5 で追加するため、現時点は unit のみ）:

```json
"test": "vp test",
```

- [ ] **Step 5: nfp の test を走らせて緑であることを確認**

```bash
cd packages/note-first-presenter && vp test
```

期待: 既存の nfp unit 9 ファイル（notes / db / config / slides / build-integration / export-bin-integration / build / export / plugin）が全件 pass。run 出力に `unit` project ラベルが表示される。

- [ ] **Step 6: client の test を走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 既存 client unit 16 ファイル（runtime-mode 2 + outliner 14）が全件 pass。`unit` project ラベル表示。

- [ ] **Step 7: ルートから recursive で走らせて緑であることを確認**

```bash
vp run -r test
```

期待: 両パッケージで unit のみ走り、全件 pass。

- [ ] **Step 8: lint / format / typecheck を走らせて緑であることを確認**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 9: コミット**

```bash
git add packages/client/vite.config.ts packages/note-first-presenter/vite.config.ts packages/note-first-presenter/package.json packages/client/package.json
git commit -m "test: introduce vitest workspaces with unit project per package"
```

---

## Task 2: fixture と helper の共有化

**Goal:** `sample.pdf` を `test/__fixtures__/` へ、`use-temp-cwd.ts` を `test/_helpers/` へ移動し、参照側 4 ファイルの import path / fixture path を更新する。

**Files:**

- Move: `packages/note-first-presenter/src/__tests__/fixtures/sample.pdf` → `packages/note-first-presenter/test/__fixtures__/sample.pdf`
- Move: `packages/note-first-presenter/src/__tests__/use-temp-cwd.ts` → `packages/note-first-presenter/test/_helpers/use-temp-cwd.ts`
- Modify: `packages/note-first-presenter/src/__tests__/db.test.ts:5`
- Modify: `packages/note-first-presenter/src/__tests__/config.test.ts:5`
- Modify: `packages/note-first-presenter/src/__tests__/slides.test.ts:5,7`
- Modify: `packages/note-first-presenter/src/__tests__/build-integration.test.ts:9`
- Modify: `packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts:9`
- Modify: `packages/note-first-presenter/src/commands/__tests__/build.test.ts:4-7`
- Modify: `packages/note-first-presenter/src/commands/__tests__/export.test.ts:4-7,76`

- [ ] **Step 1: ディレクトリ作成 & fixture / helper の git mv**

```bash
mkdir -p packages/note-first-presenter/test/__fixtures__ packages/note-first-presenter/test/_helpers
git mv packages/note-first-presenter/src/__tests__/fixtures/sample.pdf packages/note-first-presenter/test/__fixtures__/sample.pdf
git mv packages/note-first-presenter/src/__tests__/use-temp-cwd.ts packages/note-first-presenter/test/_helpers/use-temp-cwd.ts
rmdir packages/note-first-presenter/src/__tests__/fixtures
```

- [ ] **Step 2: db.test.ts の import を更新**

`packages/note-first-presenter/src/__tests__/db.test.ts:5` を変更:

```ts
import { useTempCwd } from '../../test/_helpers/use-temp-cwd';
```

- [ ] **Step 3: config.test.ts の import を更新**

`packages/note-first-presenter/src/__tests__/config.test.ts:5` を変更:

```ts
import { useTempCwd } from '../../test/_helpers/use-temp-cwd';
```

- [ ] **Step 4: slides.test.ts の import と fixture path を更新**

`packages/note-first-presenter/src/__tests__/slides.test.ts` で:

L5（import）:

```ts
import { useTempCwd } from '../../test/_helpers/use-temp-cwd';
```

L7（fixture path）:

```ts
const fixture = path.resolve(import.meta.dirname, '../../test/__fixtures__/sample.pdf');
```

- [ ] **Step 5: build-integration.test.ts の fixture path を更新**

`packages/note-first-presenter/src/__tests__/build-integration.test.ts:9` を変更:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../../test/__fixtures__/sample.pdf');
```

> 注: このファイル自体は Task 3 で `test/cli/` に移動するが、ここでは現位置のまま path のみ更新し、Task 1 で立てた unit project の下で緑を保つ。

- [ ] **Step 6: export-bin-integration.test.ts の fixture path を更新**

`packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts:9` を変更:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../../test/__fixtures__/sample.pdf');
```

- [ ] **Step 7: commands/**tests**/build.test.ts の import と fixture path を更新**

`packages/note-first-presenter/src/commands/__tests__/build.test.ts` で:

L4-5（import 周辺）:

```ts
import { useTempCwd } from '../../../test/_helpers/use-temp-cwd';
import { writeBuildData } from '../build';
```

L7（fixture path）:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../../../test/__fixtures__/sample.pdf');
```

- [ ] **Step 8: commands/**tests**/export.test.ts の import と fixture path を更新**

`packages/note-first-presenter/src/commands/__tests__/export.test.ts` で:

L5-6（import 周辺）:

```ts
import { useTempCwd } from '../../../test/_helpers/use-temp-cwd';
import { buildExportContext, exportPage, toHtml, toMarkdown } from '../export';
```

L76（fixture path）:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../../../test/__fixtures__/sample.pdf');
```

- [ ] **Step 9: nfp test を走らせて全件緑であることを確認**

```bash
cd packages/note-first-presenter && vp test
```

期待: 既存件数のまま全件 pass（fixture path / import path 切り替えの回帰がないこと）。

- [ ] **Step 10: lint / format / typecheck を走らせて緑であることを確認**

```bash
vp check
```

期待: 全 clean（tsconfig が `test/**` を見つけられないと型エラーが出る可能性。出た場合は次 Step で対応）。

- [ ] **Step 11: tsconfig の include 確認**

`packages/note-first-presenter/tsconfig.json` を読み、`include` に `src/**` のみある場合は `test/**` を追加:

```json
"include": ["src/**/*", "test/**/*"]
```

> 注: 既に `**/*` のような広いパターンなら変更不要。変更後に再度 `vp check` を実行して clean を確認。

- [ ] **Step 12: コミット**

```bash
git add packages/note-first-presenter
git commit -m "test(nfp): consolidate fixture and helper under test/ directory"
```

---

## Task 3: CLI integration テスト移設 + globalSetup 集約

**Goal:** 2 つの `*-integration.test.ts` を `test/cli/*.cli.test.ts` へ移動・改名し、nfp に `vitest.cli.config.ts` を新規作成（`globalSetup` で `vp pack` を 1 回に集約）、ルート `package.json` に `test:cli` スクリプトと `ready` 再定義を入れる。仕様 R1 フォールバックのため `test.projects` ではなく独立した config ファイルを使う。

**Files:**

- Move: `packages/note-first-presenter/src/__tests__/build-integration.test.ts` → `packages/note-first-presenter/test/cli/build.cli.test.ts`
- Move: `packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts` → `packages/note-first-presenter/test/cli/export.cli.test.ts`
- Create: `packages/note-first-presenter/test/cli/setup-pack.ts`
- Modify: `packages/note-first-presenter/vite.config.ts`
- Modify: `package.json`（root）

- [ ] **Step 1: テストファイルを cli ディレクトリへ git mv**

```bash
mkdir -p packages/note-first-presenter/test/cli
git mv packages/note-first-presenter/src/__tests__/build-integration.test.ts packages/note-first-presenter/test/cli/build.cli.test.ts
git mv packages/note-first-presenter/src/__tests__/export-bin-integration.test.ts packages/note-first-presenter/test/cli/export.cli.test.ts
```

- [ ] **Step 2: build.cli.test.ts の相対 path を更新**

`packages/note-first-presenter/test/cli/build.cli.test.ts` の冒頭 path 計算を更新（`src/__tests__/` から `test/cli/` に移動したため）:

L7:

```ts
const pkgDir = path.resolve(import.meta.dirname, '../..');
```

L9:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../__fixtures__/sample.pdf');
```

- [ ] **Step 3: export.cli.test.ts の相対 path を更新**

`packages/note-first-presenter/test/cli/export.cli.test.ts` の同様の箇所を更新:

L7:

```ts
const pkgDir = path.resolve(import.meta.dirname, '../..');
```

L9:

```ts
const SAMPLE = path.resolve(import.meta.dirname, '../__fixtures__/sample.pdf');
```

- [ ] **Step 4: setup-pack.ts を作成（vp pack を 1 回に集約）**

`packages/note-first-presenter/test/cli/setup-pack.ts` を作成:

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  const pkgDir = path.resolve(import.meta.dirname, '../..');
  execFileSync('vp', ['pack'], { cwd: pkgDir, stdio: 'pipe' });
}
```

- [ ] **Step 5: build.cli.test.ts / export.cli.test.ts から `vp pack` 呼び出しを削除**

`packages/note-first-presenter/test/cli/build.cli.test.ts` の `beforeAll` 内から下記行を削除（残りの fixture セットアップは保持）:

```ts
execFileSync('vp', ['pack'], { cwd: pkgDir, stdio: 'pipe' });
```

`packages/note-first-presenter/test/cli/export.cli.test.ts` でも同様の行を削除。

> 注: `execFileSync` の import が他で使われていない場合は import 文も整理する（`process.execPath` で bin 起動の方で使うため残るはず）。残れば残す、不要なら削除。実装時に確認。

- [ ] **Step 6: nfp vite.config.ts に cli project を追加**

`packages/note-first-presenter/vitest.cli.config.ts` を新規作成:

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

- [ ] **Step 7: ルート package.json に test:cli スクリプトを追加し ready を再定義**

`package.json`（root）を変更:

```json
"scripts": {
  "ready": "vp check && vp run -r test && pnpm test:cli && vp run test:e2e && vp run -r build",
  "test:cli": "pnpm -F note-first-presenter exec vp test -c vitest.cli.config.ts",
  "test:e2e": "playwright test",
  "prepare": "vp config"
}
```

- [ ] **Step 8: unit テストが cli を取り込まないことを確認**

```bash
cd packages/note-first-presenter && vp test
```

期待: cli の 2 ファイルは include されず、unit 7 ファイル（notes / db / config / slides / build / export / plugin）のみ走る。180 秒タイムアウトの重テストが消えていることを確認。

- [ ] **Step 9: cli テストが緑であることを確認**

```bash
pnpm test:cli
```

期待: `vp pack` が globalSetup で 1 回実行され、build.cli.test.ts と export.cli.test.ts の 4 ケース全件 pass。

- [ ] **Step 10: lint / format / typecheck**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 11: コミット**

```bash
git add packages/note-first-presenter package.json
git commit -m "test(nfp): split CLI integration tests into separate cli project"
```

---

## Task 4: export CLI テストに `--template` ケースを追加

**Goal:** `export.cli.test.ts` に、ユーザー指定テンプレ (`--template <eta>`) で `.md` 出力する CLI フラグ結線テストを 1 ケース追加（unit `exportPage` はカバー済みだが CLI フラグからの結線は未検証）。

**Files:**

- Modify: `packages/note-first-presenter/test/cli/export.cli.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/note-first-presenter/test/cli/export.cli.test.ts` に新しい `describe`／`it` を追加（既存の `describe('note-first-presenter export (bin integration, built-in template)', ...)` の **後ろ** に追加）:

```ts
describe('note-first-presenter export (bin integration, --template flag)', () => {
  let tmplTmp: string;

  beforeAll(async () => {
    tmplTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nfp-export-tmpl-'));
    await fs.copyFile(SAMPLE, path.join(tmplTmp, 'slides.pdf'));
    await fs.writeFile(
      path.join(tmplTmp, '.note-first-presenter.json'),
      JSON.stringify({ version: 1, title: 'Tmpl Deck', outline: { type: 'doc', content: [] } }),
    );
    await fs.writeFile(
      path.join(tmplTmp, 'tpl.eta'),
      '# <%= it.title %>\n<% it.slides.forEach(function (s) { %>![](<%= s.image %>)\n<% }) %>',
    );
    await fs.writeFile(
      path.join(tmplTmp, 'note-first-presenter.config.ts'),
      `export default { slides: 'slides.pdf' };\n`,
    );
    execFileSync(
      process.execPath,
      [binPath, 'export', '--template', 'tpl.eta', '--extension', 'md'],
      { cwd: tmplTmp, stdio: 'pipe' },
    );
  }, 180_000);

  afterAll(async () => {
    if (tmplTmp) await fs.rm(tmplTmp, { recursive: true, force: true });
  });

  it('renders user-specified eta template into .md output', async () => {
    const out = await fs.readFile(path.join(tmplTmp, 'export', 'slides.md'), 'utf8');
    expect(out).toContain('# Tmpl Deck');
    expect(out).toContain('![](images/0001.webp)');
    expect(out).not.toContain('<!DOCTYPE html>');
  });
});
```

> 注: `--extension md` フラグの存在は `packages/note-first-presenter/src/commands/export.ts` の citty 定義に依存。実装時に `commands/export.ts` を確認し、フラグ名が異なる場合（例: `--ext`）はそちらに合わせる。

- [ ] **Step 2: 実装の存在を確認（CLI フラグが実装済みか）**

```bash
grep -n "template\|extension" packages/note-first-presenter/src/commands/export.ts
```

期待: `--template` と `--extension`（または `--ext`）が citty コマンド定義の `args` に存在。フラグ名が異なる場合は Step 1 を実装の真と合わせて修正する。

- [ ] **Step 3: テストを走らせて緑であることを確認**

```bash
pnpm test:cli
```

期待: 新しい 1 ケースが pass。既存 4 ケースも pass。

> 注: もし fail した場合、テストが実装と乖離しているか、フラグの結線にバグがあるかのいずれか。前者は Step 1 のテストを修正、後者は本タスクのスコープ外として別 issue に切る。

- [ ] **Step 4: コミット**

```bash
git add packages/note-first-presenter/test/cli/export.cli.test.ts
git commit -m "test(nfp): cover --template flag in export CLI integration"
```

---

## Task 5: component project の立ち上げ（R2 スモーク）

**Goal:** `packages/client/vite.config.ts` に component project を追加し、最初の browser テスト `SlideListErrorOverlay.browser.test.ts` を 1 件書いて緑にする。これでリスク R2（`vitest-browser-svelte` × runes の互換）を検証する。

**Files:**

- Modify: `packages/client/vite.config.ts`
- Modify: `packages/client/package.json:28`
- Create: `packages/client/src/lib/slide-status/__tests__/SlideListErrorOverlay.browser.test.ts`

- [ ] **Step 1: client vite.config.ts に component project を追加**

`packages/client/vitest.browser.config.ts` を新規作成:

```ts
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
```

- [ ] **Step 2: client package.json の test スクリプトに component を追加**

`packages/client/package.json` の `"test"` を:

```json
"test": "vp test && vp test -c vitest.browser.config.ts",
```

- [ ] **Step 3: 最初の component テストを書く**

`packages/client/src/lib/slide-status/__tests__/SlideListErrorOverlay.browser.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideListErrorOverlay from '../SlideListErrorOverlay.svelte';

describe('SlideListErrorOverlay', () => {
  it('renders the message inside a role="alert" container', async () => {
    const screen = render(SlideListErrorOverlay, { message: 'Slides not found' });
    const alert = screen.getByRole('alert');
    await expect.element(alert).toBeInTheDocument();
    await expect.element(alert).toHaveTextContent('Slides not found');
  });

  it('sets aria-live="assertive" so screen readers announce the error', async () => {
    const screen = render(SlideListErrorOverlay, { message: 'X' });
    const alert = screen.getByRole('alert');
    await expect.element(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
```

- [ ] **Step 4: テストを走らせて緑であることを確認（R2 検証）**

```bash
cd packages/client && vp test -c vitest.browser.config.ts
```

期待: Chromium が headless で起動し、2 ケース全件 pass。

> **R2 ハマり時の対応**: もし fail する場合、`vitest-browser-svelte` 2.1 が Svelte 5 runes の `$props()` で props を受け取れないことが原因の可能性。fallback として `setContext` 経由の薄い wrapper コンポーネントを `__tests__/wrappers/` に置く案を採る。ここで詰まったら以降のタスクを停止し、判断を仰ぐ。

- [ ] **Step 5: client の unit + component を同時実行して緑であることを確認**

```bash
cd packages/client && vp test
```

期待: unit 16 ファイル + component 1 ファイル の合計 17 ファイル相当が全件 pass。

- [ ] **Step 6: lint / format / typecheck**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 7: コミット**

```bash
git add packages/client
git commit -m "test(client): introduce browser component project with SlideListErrorOverlay smoke"
```

---

## Task 6: 残りの leaf component テスト

**Goal:** `SlideListHint` / `SlideshowFallback` / `SlideImage` の 3 件の browser テストを追加。

**Files:**

- Create: `packages/client/src/lib/slide-status/__tests__/SlideListHint.browser.test.ts`
- Create: `packages/client/src/lib/slide-status/__tests__/SlideshowFallback.browser.test.ts`
- Create: `packages/client/src/lib/slide-image/__tests__/SlideImage.browser.test.ts`

- [ ] **Step 1: SlideListHint テストを書く**

`packages/client/src/lib/slide-status/__tests__/SlideListHint.browser.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideListHint from '../SlideListHint.svelte';

describe('SlideListHint', () => {
  it('renders the message as role="status" with aria-live="polite"', async () => {
    const screen = render(SlideListHint, { message: 'Drop a PDF to begin' });
    const status = screen.getByRole('status');
    await expect.element(status).toHaveTextContent('Drop a PDF to begin');
    await expect.element(status).toHaveAttribute('aria-live', 'polite');
  });
});
```

- [ ] **Step 2: SlideshowFallback テストを書く**

`packages/client/src/lib/slide-status/__tests__/SlideshowFallback.browser.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideshowFallback from '../SlideshowFallback.svelte';

describe('SlideshowFallback', () => {
  it('renders the message as a paragraph', async () => {
    const screen = render(SlideshowFallback, { message: 'No slides yet' });
    const para = screen.getByText('No slides yet');
    await expect.element(para).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: SlideImage テストを書く（dev mode）**

`packages/client/src/lib/slide-image/__tests__/SlideImage.browser.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

beforeAll(() => {
  vi.stubGlobal('__NFP_STATIC__', false);
});

describe('SlideImage (dev mode)', () => {
  it('uses /api/slide/{hash}/{n} as src', async () => {
    const { default: SlideImage } = await import('../SlideImage.svelte');
    const screen = render(SlideImage, { hash: 'abc', slide: 3, alt: 'Slide 3' });
    const img = screen.getByAltText('Slide 3');
    await expect.element(img).toHaveAttribute('src', '/api/slide/abc/3');
  });
});
```

> 注: dev と build の両モードを 1 ファイル内で切り替えるのは `__NFP_STATIC__` がモジュール初期化時評価のため難しい。`runtime-mode.{dev,build}.test.ts` の前例（2 ファイル分割）と同じ理由で、`SlideImage.browser.test.ts` も必要なら 2 ファイルに分割するのが妥当だが、まずは dev モード 1 ファイルで実装。build モードのカバレッジは `runtime-mode.build.test.ts` が URL 計算を既に網羅しているため、コンポーネント側の build モードテストは省略（YAGNI）。

- [ ] **Step 4: テストを走らせて全件緑であることを確認**

```bash
cd packages/client && vp test -c vitest.browser.config.ts
```

期待: SlideListErrorOverlay + 上記 3 件で合計 4 ファイル全件 pass。

- [ ] **Step 5: lint / format / typecheck**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 6: コミット**

```bash
git add packages/client
git commit -m "test(client): add browser tests for SlideListHint, SlideshowFallback, SlideImage"
```

---

## Task 7: Store unit テスト

**Goal:** `active-slide-store` / `slides-meta-store` / `db/client` / `theme-store` の 4 件の unit テスト（happy-dom）を追加。

**Files:**

- Create: `packages/client/src/lib/active-slide/__tests__/active-slide-store.test.ts`
- Create: `packages/client/src/lib/slides-meta/__tests__/slides-meta-store.test.ts`
- Create: `packages/client/src/lib/db/__tests__/db-client.test.ts`
- Create: `packages/client/src/lib/theme/__tests__/theme-store.test.ts`

- [ ] **Step 1: active-slide-store のテストを書く**

`packages/client/src/lib/active-slide/__tests__/active-slide-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { ActiveSlideStore } from '../active-slide-store.svelte';

describe('ActiveSlideStore', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('starts at slide 1 by default', () => {
    const s = new ActiveSlideStore();
    expect(s.value).toBe(1);
  });

  it('hydrate() reads ?slide=N from URL', () => {
    history.replaceState(null, '', '/?slide=7');
    const s = new ActiveSlideStore();
    s.hydrate();
    expect(s.value).toBe(7);
  });

  it('hydrate() ignores non-numeric / < 1 values', () => {
    history.replaceState(null, '', '/?slide=foo');
    const s = new ActiveSlideStore();
    s.hydrate();
    expect(s.value).toBe(1);
    history.replaceState(null, '', '/?slide=0');
    s.hydrate();
    expect(s.value).toBe(1);
  });

  it('syncToUrl() writes ?slide=N via history.replaceState', () => {
    const s = new ActiveSlideStore();
    s.set(5);
    s.syncToUrl();
    expect(new URL(location.href).searchParams.get('slide')).toBe('5');
  });

  it('syncToUrl() is a no-op when ?slide already matches', () => {
    history.replaceState(null, '', '/?slide=3');
    const s = new ActiveSlideStore();
    s.set(3);
    const before = location.href;
    s.syncToUrl();
    expect(location.href).toBe(before);
  });
});
```

- [ ] **Step 2: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 5 ケース全件 pass。

- [ ] **Step 3: slides-meta-store のテストを書く**

`packages/client/src/lib/slides-meta/__tests__/slides-meta-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const fetchMock = vi.fn();

vi.mock('$lib/server-client', () => ({
  api: (...args: unknown[]) => fetchMock(...args),
}));

describe('SlidesMetaStore', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('load() stores resolved meta on 200', async () => {
    fetchMock.mockResolvedValueOnce({ status: 'resolved', hash: 'h', pageCount: 4 });
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ status: 'resolved', hash: 'h', pageCount: 4 });
    expect(s.error).toBeNull();
  });

  it('load() stores SlidesStatus body on 422 (via err.data)', async () => {
    fetchMock.mockRejectedValueOnce({
      data: { kind: 'no-config-no-file' },
      message: '422',
    });
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toEqual({ kind: 'no-config-no-file' });
    expect(s.error).toBeNull();
  });

  it('load() stores message on network failure (no err.data)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const { SlidesMetaStore } = await import('../slides-meta-store.svelte');
    const s = new SlidesMetaStore();
    await s.load();
    expect(s.data).toBeNull();
    expect(s.error).toBe('network down');
  });
});
```

> 注: `$lib/server-client` の alias は `packages/client/vite.config.ts` の svelte plugin が解決する。test project でも有効なはず。動作しなければ `resolve.alias` を test project に明示追加。

- [ ] **Step 4: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 3 ケース全件 pass。

- [ ] **Step 5: db-client のテストを書く**

`packages/client/src/lib/db/__tests__/db-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { defaultDb } from '../schema';
import { DbStore } from '../client.svelte';

describe('DbStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with the provided initial state', () => {
    const initial = { ...defaultDb(), title: 'init' };
    const s = new DbStore({ initial, save: async () => {} });
    expect(s.state.title).toBe('init');
  });

  it('replace() sets state without scheduling a save', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.replace({ ...defaultDb(), title: 'r' });
    vi.runAllTimers();
    expect(save).not.toHaveBeenCalled();
  });

  it('setTitle() debounces save by 500ms', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('a');
    s.setTitle('ab');
    s.setTitle('abc');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'abc' }));
  });

  it('flush() reports saveStatus transitions on success', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    const p = vi.advanceTimersByTimeAsync(500);
    expect(s.saveStatus).toBe('idle');
    await p;
    expect(s.saveStatus).toBe('idle');
    expect(s.lastError).toBeNull();
  });

  it('flush() captures error message on save failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const s = new DbStore({ initial: defaultDb(), save });
    s.setTitle('x');
    await vi.advanceTimersByTimeAsync(500);
    expect(s.saveStatus).toBe('error');
    expect(s.lastError).toBe('boom');
  });
});
```

- [ ] **Step 6: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 5 ケース全件 pass。fail する場合、`$state` を持つクラスを new するために component test に上げる必要があるかもしれない（runes の reactive context が unit env に無いと props 不要なクラスでも初期化エラーが出る可能性）。fail した場合は当該ファイルを `*.browser.test.ts` にリネームして component project に移動。

- [ ] **Step 7: theme-store のテストを書く**

`packages/client/src/lib/theme/__tests__/theme-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ThemeStore } from '../theme-store.svelte';

describe('ThemeStore', () => {
  let listeners: Array<(e: MediaQueryListEvent) => void> = [];
  let mqlMatches = false;

  beforeEach(() => {
    listeners = [];
    mqlMatches = false;
    localStorage.clear();
    vi.stubGlobal('matchMedia', (_q: string) => ({
      matches: mqlMatches,
      addEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
      removeEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((x) => x !== l);
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrate() defaults to system mode when localStorage is empty', () => {
    const s = new ThemeStore();
    s.hydrate();
    expect(s.mode).toBe('system');
  });

  it('hydrate() picks up persisted "dark"', () => {
    localStorage.setItem('nfp:theme', 'dark');
    const s = new ThemeStore();
    s.hydrate();
    expect(s.mode).toBe('dark');
  });

  it('resolved derives from mode and systemPrefersDark', () => {
    const s = new ThemeStore();
    s.mode = 'system';
    s.systemPrefersDark = true;
    expect(s.resolved).toBe('dark');
    s.mode = 'light';
    expect(s.resolved).toBe('light');
  });

  it('listenSystem() updates systemPrefersDark on media change', () => {
    mqlMatches = false;
    const s = new ThemeStore();
    s.hydrate();
    const stop = s.listenSystem();
    listeners[0]?.({ matches: true } as MediaQueryListEvent);
    expect(s.systemPrefersDark).toBe(true);
    stop();
    expect(listeners).toHaveLength(0);
  });
});
```

- [ ] **Step 8: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 4 ケース全件 pass。

- [ ] **Step 9: lint / format / typecheck**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 10: コミット**

```bash
git add packages/client
git commit -m "test(client): cover active-slide, slides-meta, db, theme stores"
```

---

## Task 8: Sync unit テスト

**Goal:** `sync-publisher` / `sync-subscriber` の 2 件の unit テスト（happy-dom 環境の `BroadcastChannel`）を追加。

**Files:**

- Create: `packages/client/src/lib/sync/__tests__/sync-publisher.test.ts`
- Create: `packages/client/src/lib/sync/__tests__/sync-subscriber.test.ts`

- [ ] **Step 1: sync-publisher のテストを書く**

`packages/client/src/lib/sync/__tests__/sync-publisher.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { SyncPublisher } from '../sync-publisher';
import type { SyncMessage } from '../messages';

describe('SyncPublisher', () => {
  it('publishActiveSlide posts { type, slide } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishActiveSlide(7);

    // BroadcastChannel delivers async; yield to the event loop.
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([{ type: 'active-slide', slide: 7 }]);

    listener.close();
    pub.destroy();
  });

  it('destroy() prevents further publishes', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.destroy();
    pub.publishActiveSlide(1); // no-op
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([]);
    listener.close();
  });
});
```

> 注: happy-dom 20 は `BroadcastChannel` を持つ。`BROWSER` フラグは esm-env が `import.meta.env.SSR` を見るが、happy-dom 環境は browser 判定されるはず。fail した場合は `vi.stubGlobal` で `BROWSER` を true 固定するか、esm-env の挙動を確認。

- [ ] **Step 2: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 2 ケース全件 pass。

- [ ] **Step 3: sync-subscriber のテストを書く**

`packages/client/src/lib/sync/__tests__/sync-subscriber.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { SyncSubscriber } from '../sync-subscriber';
import type { SyncMessage } from '../messages';

describe('SyncSubscriber', () => {
  it('subscribe receives messages broadcast on the channel', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));

    const other = new BroadcastChannel('nfp:active-slide');
    other.postMessage({ type: 'active-slide', slide: 4 } satisfies SyncMessage);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([{ type: 'active-slide', slide: 4 }]);

    unsubscribe();
    other.close();
    sub.destroy();
  });

  it('unsubscribe removes the listener', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));
    unsubscribe();

    const other = new BroadcastChannel('nfp:active-slide');
    other.postMessage({ type: 'active-slide', slide: 1 } satisfies SyncMessage);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([]);

    other.close();
    sub.destroy();
  });
});
```

- [ ] **Step 4: テストを走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: 2 ケース全件 pass。

- [ ] **Step 5: lint / format / typecheck**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 6: コミット**

```bash
git add packages/client
git commit -m "test(client): cover SyncPublisher and SyncSubscriber"
```

---

## Task 9: e2e 縮減

**Goal:** `outliner-range.e2e.ts` から unit と振る舞いが等価な 3 件を削除し、ファイルを 2 ケース構成に整理する。

**Files:**

- Modify: `e2e/outliner-range.e2e.ts`

- [ ] **Step 1: 削除前の e2e を全件走らせて緑であることを確認**

```bash
pnpm test:e2e
```

期待: 既存 11 件（presenter 4 + outliner-range 5 + slideshow-sync 2）全件 pass。

- [ ] **Step 2: 3 ケースを削除**

`e2e/outliner-range.e2e.ts` から以下の 3 ブロックを削除:

- `test('Shift+ArrowDown extends a single-item NodeRangeSelection downward', ...)` の `test(...)` 全体（おおむね L65-75）
- `test('Backspace on a NodeRangeSelection deletes the entire range', ...)` の `test(...)` 全体（おおむね L77-91）
- `test('Tab indents a NodeRangeSelection under the previous sibling', ...)` の `test(...)` 全体（おおむね L120-137）

残るのは:

- `test('Shift+Click on a bullet extends a NodeRangeSelection from the anchor item', ...)`
- `test('Mod+Shift+ArrowDown moves a NodeRangeSelection past the next sibling', ...)`

> 注: ファイル先頭の `clickBullet` ヘルパは 2 残るケースから引き続き使われるので削除しない。`test.beforeEach` も保持。

- [ ] **Step 3: 削除後の e2e を走らせて緑であることを確認**

```bash
pnpm test:e2e
```

期待: 件数が 11 → 8 件になり、全件 pass。

- [ ] **Step 4: コミット**

```bash
git add e2e/outliner-range.e2e.ts
git commit -m "test(e2e): drop outliner-range cases covered by unit tests"
```

---

## Task 10: per-file env directive の削除

**Goal:** `outliner/__tests__/paste.test.ts` 先頭の `// @vitest-environment happy-dom` を削除し、client unit project 全体の `environment: 'happy-dom'` 設定に統一する。

**Files:**

- Modify: `packages/client/src/lib/outliner/__tests__/paste.test.ts:1`

- [ ] **Step 1: ディレクティブを削除**

`packages/client/src/lib/outliner/__tests__/paste.test.ts` の先頭行（`// @vitest-environment happy-dom`）を削除する。

変更後の冒頭は:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { parseHtmlList, parsePlainTextOutline } from '../plugins/paste';
```

- [ ] **Step 2: paste.test.ts を走らせて緑であることを確認**

```bash
cd packages/client && vp test
```

期待: paste.test.ts のケース全件 pass（unit project の `environment: 'happy-dom'` が引き継がれ、`DOMParser` が動作する）。

- [ ] **Step 3: コミット**

```bash
git add packages/client/src/lib/outliner/__tests__/paste.test.ts
git commit -m "test(client): drop redundant per-file env directive from paste.test.ts"
```

---

## Task 11: CLAUDE.md に Testing layers セクションを追記

**Goal:** プロジェクト規約として、新しい層構造と判定基準を CLAUDE.md に明文化する。

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: 追記する**

`CLAUDE.md` の `<!--VITE PLUS END-->` の **下** に以下を追記:

```md
## Testing layers

- `**/__tests__/*.test.ts` — unit (vitest, Node or happy-dom)
- `**/__tests__/*.browser.test.ts` — component (vitest browser, Chromium)
- `packages/note-first-presenter/test/cli/*.cli.test.ts` — CLI integration (vitest, runs packed bin)
- `e2e/*.e2e.ts` — end-to-end (Playwright)

Layer is determined by the filename. See `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md` for the criteria.

Run: `vp test`（unit + component, per package）／ `pnpm test:cli`（CLI integration）／ `pnpm test:e2e`（Playwright）.
```

- [ ] **Step 2: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: document the four-layer test taxonomy in CLAUDE.md"
```

---

## Task 12: 最終検証

**Goal:** `pnpm ready` 相当のフル検証で全層緑を確認し、件数が想定どおりになっていることを確認する。

- [ ] **Step 1: vp check**

```bash
vp check
```

期待: 全 clean。

- [ ] **Step 2: 各パッケージの test（unit + component）を recursive 実行**

```bash
vp run -r test
```

期待:

- nfp: unit 8 ファイル（notes / db / config / slides / build / export / plugin、Task 2 後は 7、Task 3 後も 7）
- client: unit 22 ファイル + component 4 ファイル

全件 pass。

- [ ] **Step 3: CLI integration テスト**

```bash
pnpm test:cli
```

期待: build / export の 2 ファイル、合計 5 ケース（Task 4 で 1 ケース追加）pass。

- [ ] **Step 4: e2e**

```bash
pnpm test:e2e
```

期待: 3 ファイル合計 8 件 pass（Task 9 で 3 件削減）。

- [ ] **Step 5: build**

```bash
vp run -r build
```

期待: 全パッケージ build 成功。

- [ ] **Step 6: 集計チェック**

仕様セクション 8 の表と一致することを目視確認:

| 層              | 想定              |
| --------------- | ----------------- |
| unit            | 29 ファイル       |
| component       | 4 ファイル        |
| cli-integration | 2 ファイル        |
| e2e             | 3 ファイル / 8 件 |

不一致があれば原因を追跡。

- [ ] **Step 7: コミットなし（検証のみ、ここで PR 作成へ）**

---

## Self-Review メモ

- **Spec coverage**: 仕様セクション 1-9 すべてに対応する Task がある（1: Task 1+5+11 / 2: Task 1-3 / 3: Task 1+3 / 4: Task 4-8 / 5: Task 2+3 / 5.5: Task 9-10 / 6: Task 11 / 7: Task 1-12 / 8: Task 12 / 9: Task 5 が R2 検証）。
- **Placeholder scan**: 「TBD」「TODO」「実装時に確認」は 2 箇所（Task 4 Step 2 のフラグ名確認、Task 5 Step 4 の R2 fallback）。これらは事前に確定できない仕様外要因であり、判断分岐を明示してあるため許容。
- **Type consistency**: `ActiveSlideStore` / `SlidesMetaStore` / `DbStore` / `ThemeStore` / `SyncPublisher` / `SyncSubscriber` のクラス名・メソッド名・props 名は実装と一致確認済み（読み込み時に確認）。
- **依存関係**: `vitest-browser-svelte` 2.1, `@vitest/browser-playwright` 4.1, `happy-dom` 20 はすべて lockfile にインストール済み。追加 install 不要。
