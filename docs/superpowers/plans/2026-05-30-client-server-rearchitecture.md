# client / server リアーキテクチャ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SvelteKit を撤去して `@note-first-presenter/client` を純 Svelte SPA 化し、Node/サーバ/Vite/仮想モジュールを `note-first-presenter`（CLI）へ集約する。共有コードゼロ・依存は `cli → client` の一方向のみにする。

**Architecture:** サーバドメイン（pdf-renderer / db-io / slide-cache / pipeline）を CLI の `src/node/` へ移し、SvelteKit の API ルートを CLI 所有の Vite ミドルウェア（`/api/slide`・`/api/slides/meta`・`/api/db`）に置換。CLI が Vite config を一元所有し、client は単一 `index.html` の SPA（`location.pathname` をマウント時に読んで `Presenter`/`Slideshow` を出し分け、遷移は素のリンク）。mode は `__NFP_STATIC__` define、サーバ設定はミドルウェアのクロージャ引数で渡す。

**Tech Stack:** TypeScript, citty, valibot, pdfjs-dist + @napi-rs/canvas, Svelte 5, @sveltejs/vite-plugin-svelte, @inlang/paraglide-js, eta, Vite（`@voidzero-dev/vite-plus-core`）, Vitest, Playwright, vite-plus.

設計: `docs/superpowers/specs/2026-05-30-client-server-rearchitecture-design.md`

**実装方針の注記:** 本計画は大規模な移設を含む。既存実装をそのまま移す箇所は「移設 + import パス更新 + 既存テストで検証」とし、コード全文は再掲しない（移設元パスを明示）。新規ロジック（ミドルウェア・ルーティング・i18n・エントリ・mode define）はコードを明示する。各タスク末で関連テストを緑にしてからコミットする。

---

## Phase 1 — サーバドメインを CLI へ / API をミドルウェア化（UI は SvelteKit のまま）

可逆性が高い（UI に触れない）。症状②③④⑥を解消する。完了時、dev/build/export は CLI 所有のミドルウェア + 内部 pipeline 経由で動作し、client からサーバコードが消える。

### File Structure（Phase 1）

**cli（新規）**

- `packages/note-first-presenter/src/node/pdf-renderer.ts` — `client/src/lib/server/pdf-renderer.ts` の移設先。
- `packages/note-first-presenter/src/node/slide-cache.ts` — 同 `slide-cache.ts` 移設先。
- `packages/note-first-presenter/src/node/db-io.ts` — 同 `db-io.ts` 移設先（client 文書モデルへの依存を断ち、自前 default を持つ）。
- `packages/note-first-presenter/src/node/db-schema.ts` — CLI 自前の valibot 入力検証スキーマ + 空デフォルト。
- `packages/note-first-presenter/src/node/slide-filename.ts` — `slideFilename` のコピー（3 行・命名規約）。
- `packages/note-first-presenter/src/node/pipeline/{note-tree,format,render-slides,context,export,build-data,types}.ts` + `default-template.eta` — `client/src/lib/pipeline/*` の移設先。
- `packages/note-first-presenter/src/middleware/api.ts` — `/api/*` を捌く connect 互換ミドルウェア生成関数。
- 各 `__tests__/` — 移設に伴うテスト移動。

**cli（変更）**

- `packages/note-first-presenter/src/plugin/index.ts` — `configureServer` でミドルウェアを登録。`virtual:nfp/runtime-config` の供給を撤去（mode は維持）。
- `packages/note-first-presenter/src/plugin/virtual-modules.ts` — `runtime-config` 生成を撤去。
- `packages/note-first-presenter/src/build.ts` / `export.ts` — `@note-first-presenter/client/pipeline/*` → `./node/pipeline/*` へ。
- `packages/note-first-presenter/vite.config.ts` — `vp pack` の `alwaysBundle: /^@note-first-presenter\/client/` を撤去。
- `packages/note-first-presenter/package.json` — pdfjs/canvas/eta は宣言済みのため維持。

**client（削除）**

- `packages/client/src/lib/server/**`、`packages/client/src/lib/pipeline/**`、`packages/client/src/routes/api/**`。
- `packages/client/package.json` の `exports` から `./pipeline/export`・`./pipeline/build-data` を削除。

**client（維持）**

- `packages/client/src/lib/db/schema.ts`（文書モデル `DbV1`/`defaultDb`、UI 専用）、`packages/client/src/lib/slide-filename.ts`（`runtime-mode` 用）、`runtime-mode.ts`（Phase 1 では `virtual:nfp/mode` のまま）。

### Task 1.1: サーバドメインを CLI `src/node/` へ移設

**Files:**

- Create: `packages/note-first-presenter/src/node/pdf-renderer.ts`, `slide-cache.ts`, `db-io.ts`, `db-schema.ts`, `slide-filename.ts`
- Create: `packages/note-first-presenter/src/node/__tests__/*`（移設テスト）
- Delete: `packages/client/src/lib/server/**`（Task 1.3 で削除。本タスクではコピー）

- [ ] **Step 1: pdf-renderer / slide-cache / slide-filename を移設**

`client/src/lib/server/pdf-renderer.ts`・`slide-cache.ts` と `client/src/lib/slide-filename.ts` を `packages/note-first-presenter/src/node/` へコピー。相互 import を相対パスに更新（`slide-cache` は `./slide-filename` を参照）。`client/src/lib/server/__tests__/{pdf-renderer,slide-cache}.test.ts` と fixture `sample.pdf` も `src/node/__tests__/` へ移す。

- [ ] **Step 2: CLI 自前の db スキーマと db-io を作成**

`packages/note-first-presenter/src/node/db-schema.ts`（client の `db/schema.ts` には依存しない・CLI 専有の入力検証）:

```ts
import * as v from 'valibot';

export const dbInputSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbInput = v.InferOutput<typeof dbInputSchema>;

export function emptyDb(): DbInput {
  return { version: 1, title: '', outline: { type: 'doc', content: [] } };
}
```

`packages/note-first-presenter/src/node/db-io.ts`（`client/src/lib/server/db-io.ts` を移設し、client 文書モデルへの依存を断つ）:

```ts
import { promises as fs } from 'node:fs';
import { type DbInput, emptyDb } from './db-schema';

export async function readDb(dbPath: string): Promise<DbInput> {
  try {
    const text = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(text) as DbInput;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb();
    throw err;
  }
}

export async function writeDb(dbPath: string, db: DbInput): Promise<void> {
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}
```

`client/src/lib/server/__tests__/db-io.test.ts` を `src/node/__tests__/db-io.test.ts` へ移設し、import 先と型名（`DbV1`→`DbInput`, `defaultDb`→`emptyDb`）を更新。

- [ ] **Step 3: テストを実行して緑を確認**

Run: `vp test --project note-first-presenter`（または `pnpm -F note-first-presenter test`）
Expected: 移設した pdf-renderer / slide-cache / db-io テストが PASS。

- [ ] **Step 4: コミット**

```bash
git add packages/note-first-presenter/src/node packages/client/src/lib/server
git commit -m "refactor: move server domain (pdf/db/cache) into cli src/node"
```

### Task 1.2: pipeline を CLI へ移設し build/export を内部参照へ

**Files:**

- Create: `packages/note-first-presenter/src/node/pipeline/*`
- Modify: `packages/note-first-presenter/src/build.ts`, `src/export.ts`
- Modify: `packages/note-first-presenter/src/node/pipeline/{build-data,export,render-slides}.ts`（import 先を `../` の node ドメインへ）

- [ ] **Step 1: pipeline を移設**

`client/src/lib/pipeline/*`（`note-tree` / `format` / `render-slides` / `context` / `export` / `build-data` / `types` / `default-template.eta`）を `packages/note-first-presenter/src/node/pipeline/` へコピー。`render-slides`・`build-data` の `../server/pdf-renderer`→`../pdf-renderer`、`../server/db-io`→`../db-io`、`../slide-filename`→`../slide-filename` に更新。`build-data.ts` のローカル `SlidesStatus` 型は CLI の `config/resolve-slides-path.ts` の `SlidesStatus` を import に置換（症状②解消）。`export.ts` の `DEFAULT_TEMPLATE_PATH` は `@note-first-presenter/client/...` 解決をやめ、`import.meta.url` 相対（`../node/pipeline/default-template.eta`）へ変更。`__tests__` も移設。

- [ ] **Step 2: build.ts / export.ts を内部参照へ**

`packages/note-first-presenter/src/build.ts`: `import { writeBuildData } from '@note-first-presenter/client/pipeline/build-data'` → `import { writeBuildData } from './node/pipeline/build-data'`。`buildRuntimeConfigObject` の env 渡しは Phase 1 では維持（build はまだ SvelteKit adapter-static）。
`packages/note-first-presenter/src/export.ts`: `import { runPipelineExport } from '@note-first-presenter/client/pipeline/export'` → `'./node/pipeline/export'`。

- [ ] **Step 3: client の pipeline exports と pack ハックを撤去**

`packages/client/package.json` の `exports` から `./pipeline/export`・`./pipeline/build-data` を削除。`packages/note-first-presenter/vite.config.ts` の `pack` 設定から `alwaysBundle: [/^@note-first-presenter\/client/]` を削除（`neverBundle` 等は残置可）。

- [ ] **Step 4: テスト実行**

Run: `vp test --project note-first-presenter`
Expected: pipeline 系（note-tree / format / render-slides / export-integration / build-integration）が PASS。

- [ ] **Step 5: ビルド済み bin で外部化を検証**

Run: `pnpm -F note-first-presenter build` の後 `rg -n "/Users/|/node_modules/" packages/note-first-presenter/dist/index.mjs`
Expected: 絶対パス external が無い（pdfjs/canvas/eta は bare specifier で external）。

- [ ] **Step 6: コミット**

```bash
git add packages/note-first-presenter packages/client/package.json
git commit -m "refactor: move pipeline into cli, drop client pipeline subpath + alwaysBundle hack"
```

### Task 1.3: `/api/*` ミドルウェアを作成し SvelteKit API ルートを撤去

**Files:**

- Create: `packages/note-first-presenter/src/middleware/api.ts`
- Modify: `packages/note-first-presenter/src/plugin/index.ts`
- Delete: `packages/client/src/routes/api/**`, `packages/client/src/lib/server/**`

- [ ] **Step 1: ミドルウェア生成関数を作成**

`packages/note-first-presenter/src/middleware/api.ts`。`connect`/Vite の `Connect.NextHandleFunction` 互換。サーバ設定はクロージャ引数（仮想モジュール不使用）。

```ts
import type { Connect } from 'vite';
import * as v from 'valibot';
import { dbInputSchema } from '../node/db-schema';
import { readDb, writeDb } from '../node/db-io';
import {
  ensurePdfState,
  getSlideImage,
  getSlidesMeta,
  PageOutOfRangeError,
} from '../node/pdf-renderer';
import type { SlidesStatus } from '../config/resolve-slides-path';

export interface ApiContext {
  dbPath: string;
  cacheRoot: string;
  slidesStatus: SlidesStatus;
}

export function createApiMiddleware(getCtx: () => ApiContext): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;
    const ctx = getCtx();

    const json = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };

    // GET /api/slides/meta
    if (pathname === '/api/slides/meta' && req.method === 'GET') {
      if (ctx.slidesStatus.kind !== 'resolved') return json(422, ctx.slidesStatus);
      ensurePdfState({ slidesPath: ctx.slidesStatus.path, cacheRoot: ctx.cacheRoot });
      getSlidesMeta()
        .then((meta) => json(200, { status: 'resolved', ...meta }))
        .catch(next);
      return;
    }

    // GET /api/slide/:hash/:n
    const slideMatch = pathname.match(/^\/api\/slide\/([^/]+)\/(\d+)$/);
    if (slideMatch && req.method === 'GET') {
      if (ctx.slidesStatus.kind !== 'resolved') return json(404, { error: 'slides not available' });
      ensurePdfState({ slidesPath: ctx.slidesStatus.path, cacheRoot: ctx.cacheRoot });
      const n = Number(slideMatch[2]);
      getSlideImage(n)
        .then(({ data, hash }) => {
          if (slideMatch[1] !== hash) return json(404, { error: 'hash mismatch' });
          res.statusCode = 200;
          res.setHeader('content-type', 'image/webp');
          res.setHeader('cache-control', 'public, max-age=31536000, immutable');
          res.setHeader('etag', `"${hash}-${n}"`);
          res.end(Buffer.from(data));
        })
        .catch((err) => {
          if (err instanceof PageOutOfRangeError) return json(404, { error: 'out of range' });
          next(err);
        });
      return;
    }

    // GET / PUT /api/db
    if (pathname === '/api/db') {
      if (req.method === 'GET') {
        readDb(ctx.dbPath)
          .then((db) => json(200, db))
          .catch(next);
        return;
      }
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', async () => {
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return json(400, { error: 'invalid JSON' });
          }
          const result = v.safeParse(dbInputSchema, body);
          if (!result.success) return json(400, { error: 'invalid body' });
          await writeDb(ctx.dbPath, result.output);
          res.statusCode = 204;
          res.end();
        });
        return;
      }
    }

    next();
  };
}
```

- [ ] **Step 2: プラグインにミドルウェアを登録**

`packages/note-first-presenter/src/plugin/index.ts` の `configureServer(server)` 先頭で、`server.middlewares.use(createApiMiddleware(() => ({ dbPath, cacheRoot, slidesStatus })))` を登録（`current` から `buildRuntimeConfigObject` 同等の `dbPath`/`cacheRoot`/`slidesStatus` を算出）。SPA フォールバック前に動くよう、`configureServer` は返り値関数（post hook）ではなく直接 `use` で登録する。

- [ ] **Step 3: SvelteKit API ルートと client サーバコードを削除**

```bash
git rm -r packages/client/src/routes/api packages/client/src/lib/server
```

`client/src/lib/db/schema.ts`（文書モデル）と `slide-filename.ts` は**残す**。`runtime-mode.ts` は Phase 1 では `virtual:nfp/mode` のまま。

- [ ] **Step 4: runtime-config 仮想モジュールを撤去**

`packages/note-first-presenter/src/plugin/index.ts` から `MODULE_ID = 'virtual:nfp/runtime-config'` の resolveId/load を削除（消費者ゼロ）。`MODE_ID`（`virtual:nfp/mode`）は維持。`virtual-modules.ts` の `buildVirtualConfigModuleSource` を削除、`buildRuntimeConfigObject` は build.ts の env 用に残置。`client/vite.config.ts` の `nfpBuildVirtualModules` から runtime-config 分岐を削除（mode 分岐は維持）。`client/src/app.d.ts` から `virtual:nfp/runtime-config` 宣言を削除（mode は維持）。

- [ ] **Step 5: dev/build/export を手動確認**

```bash
pnpm -F note-first-presenter build
( cd e2e/fixtures/basic && pnpm exec note-first-presenter --port 5199 ) &
sleep 3
curl -s localhost:5199/api/slides/meta; curl -s -o /dev/null -w "%{http_code}\n" localhost:5199/api/slide/<hash>/1
kill %1
```

Expected: meta が JSON、slide が 200/image。`note-first-presenter build` / `export` も成功。

- [ ] **Step 6: 全テスト + e2e**

Run: `vp test && pnpm test:e2e`
Expected: 全 PASS。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: serve /api/* via cli vite middleware, remove sveltekit api routes"
```

---

## Phase 2 — UI の SvelteKit 撤去（純 Svelte SPA 化）

フレームワーク載せ替え。Phase 1 完了後に単独実施する。症状①⑤を解消し、client を純フロント化する。

### File Structure（Phase 2）

**cli（新規/変更）**

- `packages/note-first-presenter/src/vite/config.ts` — dev/build 共通の inline Vite config 構築（svelte + paraglide + nfp plugin + `$lib` alias + `__NFP_STATIC__` define + `appType:'spa'` + `root=clientRoot`）。
- `packages/note-first-presenter/src/server.ts` / `build.ts` — client の `vite.config.ts` 参照をやめ、`src/vite/config.ts` を使用。build は SPA build + `index.html`→`200.html` コピー。
- `packages/note-first-presenter/src/plugin/index.ts` — `virtual:nfp/mode` を撤去（`__NFP_STATIC__` define へ移行）。

**client（新規）**

- `packages/client/index.html` — 単一 SPA シェル。
- `packages/client/src/main.ts` — mount エントリ。
- `packages/client/src/App.svelte` — `location.pathname` 分岐、lang/dir 設定、`app.css` import。
- `packages/client/src/Presenter.svelte` / `Slideshow.svelte` — 旧 `routes/+page.svelte` / `routes/slideshow/+page.svelte`。

**client（削除）**

- `packages/client/src/routes/**`、`src/app.html`、`src/hooks.server.ts`、`src/vite.config.ts`。

**client（変更）**

- `packages/client/svelte.config.js` — preprocess のみ。
- `packages/client/src/lib/active-slide/active-slide-store.svelte.ts` — `$app/*` → `location` + History API。
- `packages/client/src/lib/runtime-mode.ts` — `virtual:nfp/mode` → `__NFP_STATIC__`。
- `packages/client/src/app.d.ts` — `virtual:nfp/mode` 宣言を削除、`__NFP_STATIC__` の型宣言を追加。
- `packages/client/package.json` — `@sveltejs/kit`・`adapter-*`・`@sveltejs/vite-plugin-svelte` 等の所在整理（vite-plugin-svelte は CLI が使うため CLI 依存へ）。

### Task 2.1: CLI が Vite config を一元所有

**Files:**

- Create: `packages/note-first-presenter/src/vite/config.ts`
- Modify: `packages/note-first-presenter/src/server.ts`, `src/build.ts`
- Delete: `packages/client/src/vite.config.ts`
- Modify: `packages/client/svelte.config.js`

- [ ] **Step 1: inline Vite config 構築関数を作成**

`packages/note-first-presenter/src/vite/config.ts`:

```ts
import path from 'node:path';
import type { InlineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { noteFirstPresenterPlugin, type NfpPluginOptions } from '../plugin';

export interface NfpViteConfigInput extends NfpPluginOptions {
  clientRoot: string;
  isStatic: boolean;
  outDir?: string;
}

export function createViteConfig(input: NfpViteConfigInput): InlineConfig {
  return {
    root: input.clientRoot,
    configFile: false, // client 側 vite.config を自動ロードさせない
    appType: 'spa',
    resolve: { alias: { $lib: path.join(input.clientRoot, 'src/lib') } },
    define: { __NFP_STATIC__: JSON.stringify(input.isStatic) },
    plugins: [
      svelte({ preprocess: vitePreprocess() }),
      paraglideVitePlugin({
        project: path.join(input.clientRoot, 'project.inlang'),
        outdir: path.join(input.clientRoot, 'src/lib/paraglide'),
        strategy: ['preferredLanguage', 'baseLocale'],
      }),
      noteFirstPresenterPlugin(input),
    ],
    build: input.outDir ? { outDir: input.outDir, emptyOutDir: true } : undefined,
  };
}
```

- [ ] **Step 2: server.ts / build.ts を切替**

`server.ts`: `createServer(createViteConfig({ ...current, clientRoot, isStatic: false }))`（`configFile: false` 相当でクライアント vite.config を読まない）。`build.ts`: `build(createViteConfig({ ...current, clientRoot, isStatic: true, outDir }))`。`process.env.NFP_*` 渡しを撤去。

- [ ] **Step 3: client の Vite config を削除、svelte.config を縮小**

```bash
git rm packages/client/vite.config.ts
```

`packages/client/svelte.config.js` を preprocess のみへ:

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

（CLI が plugin options で preprocess を渡すなら svelte.config.js 自体を削除してもよい。）

- [ ] **Step 4: 依存の所在を CLI へ**

`@sveltejs/vite-plugin-svelte`・`@inlang/paraglide-js` を CLI（`note-first-presenter`）の `dependencies` へ追加（cli 経由で `vp add` を使用、package.json 直編集はしない）。

- [ ] **Step 5: コミット**（この時点では Task 2.2 のエントリが無いと dev 起動はできない。Phase 2 は 2.1–2.6 を連続実施し、検証は 2.7 でまとめて行う）

```bash
git add -A && git commit -m "refactor: cli owns vite config, drop client vite.config"
```

### Task 2.2: SPA エントリと page コンポーネントを作成

**Files:**

- Create: `packages/client/index.html`, `src/main.ts`, `src/App.svelte`, `src/Presenter.svelte`, `src/Slideshow.svelte`
- Delete: `packages/client/src/routes/**`, `src/app.html`

- [ ] **Step 1: index.html（単一シェル）**

`packages/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>note-first-presenter</title>
  </head>
  <body>
    <div id="app" style="display: contents"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: main.ts（mount）**

`packages/client/src/main.ts`:

```ts
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 3: App.svelte（分岐 + lang/dir + css）**

`packages/client/src/App.svelte`:

```svelte
<script lang="ts">
  import './app.css';
  import { getLocale, getTextDirection } from '$lib/paraglide/runtime';
  import Presenter from './Presenter.svelte';
  import Slideshow from './Slideshow.svelte';

  document.documentElement.lang = getLocale();
  document.documentElement.dir = getTextDirection();

  const isSlideshow = location.pathname.startsWith('/slideshow');
</script>

{#if isSlideshow}
  <Slideshow />
{:else}
  <Presenter />
{/if}
```

- [ ] **Step 4: page コンポーネントを移設**

`client/src/routes/+page.svelte` → `src/Presenter.svelte`、`client/src/routes/slideshow/+page.svelte` → `src/Slideshow.svelte` へ移設。SvelteKit 由来 import（`$app/*` 等）は Task 2.4 で置換。「スライドショーを開く」は素のリンク `<a href="/slideshow">{m.open_slideshow()}</a>`。`+layout.svelte`（`app.css` import）は App.svelte に統合済みのため削除。

```bash
git rm -r packages/client/src/routes packages/client/src/app.html
```

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: add spa entry (index.html/main.ts/App.svelte) and page components"
```

### Task 2.3: i18n をブラウザ化（hooks.server 撤去）

**Files:**

- Delete: `packages/client/src/hooks.server.ts`

- [ ] **Step 1: hooks.server.ts を削除**

```bash
git rm packages/client/src/hooks.server.ts
```

`<html lang/dir>` の設定は App.svelte（Task 2.2 Step 3）で実施済み。`index.html` の静的初期値は `lang="en"`（Task 2.2 Step 1）。

- [ ] **Step 2: 言語切替の手動確認（Task 2.7 で実施）** — ブラウザの言語設定 ja/en で `m.*()` と `<html lang>` が切り替わること。

- [ ] **Step 3: コミット**

```bash
git add -A && git commit -m "refactor: browser-side i18n, remove hooks.server"
```

### Task 2.4: ルーティングを location + History API へ

**Files:**

- Modify: `packages/client/src/lib/active-slide/active-slide-store.svelte.ts`

- [ ] **Step 1: active-slide-store を書き換え**

`$app/navigation` / `$app/state` を撤去し標準 API へ:

```ts
import { BROWSER } from 'esm-env';

export class ActiveSlideStore {
  value: number = $state(1);

  hydrate() {
    if (!BROWSER) return;
    const param = new URL(location.href).searchParams.get('slide');
    if (param) {
      const n = Number(param);
      if (Number.isFinite(n) && n >= 1) this.value = Math.floor(n);
    }
  }

  syncToUrl() {
    if (!BROWSER) return;
    const u = new URL(location.href);
    if (u.searchParams.get('slide') === String(this.value)) return;
    u.searchParams.set('slide', String(this.value));
    history.replaceState(history.state, '', u);
  }

  set(n: number) {
    this.value = n;
  }
  setFromEditor(n: number) {
    this.value = n;
  }
  setFromList(n: number) {
    this.value = n;
  }
}
```

`#ready`+try/catch ガードは不要（router レース消滅）。呼び出し側（Presenter/Slideshow）の `hydrate()`/`syncToUrl()` シグネチャは不変。

- [ ] **Step 2: page 内の残存 SvelteKit import を除去**

`Presenter.svelte` / `Slideshow.svelte` 内の `$app/*`・`@sveltejs/kit` 参照が無いことを確認（`rg -n "\\\$app/|@sveltejs/kit" packages/client/src`）。遷移リンクは素の `<a href>`。

- [ ] **Step 3: コミット**

```bash
git add -A && git commit -m "refactor: location + history api routing, drop \$app/* usage"
```

### Task 2.5: mode を `__NFP_STATIC__` define へ

**Files:**

- Modify: `packages/client/src/lib/runtime-mode.ts`, `src/app.d.ts`
- Modify: `packages/note-first-presenter/src/plugin/index.ts`, `src/vite/config.ts`

- [ ] **Step 1: runtime-mode.ts を define 参照へ**

```ts
import { slideFilename } from './slide-filename';

declare const __NFP_STATIC__: boolean;
export const isStatic = __NFP_STATIC__;

export function metaUrl(): string {
  return isStatic ? '/nfp-data/meta.json' : '/api/slides/meta';
}
export function dbUrl(): string {
  return isStatic ? '/nfp-data/db.json' : '/api/db';
}
export function slideUrl(hash: string, n: number): string {
  return isStatic ? `/nfp-data/slides/${hash}/${slideFilename(n)}` : `/api/slide/${hash}/${n}`;
}
```

- [ ] **Step 2: 仮想モジュール mode を撤去**

`plugin/index.ts` から `MODE_ID = 'virtual:nfp/mode'` の resolveId/load と `buildModeModuleSource` 参照を削除。`define: { __NFP_STATIC__ }` は `vite/config.ts`（Task 2.1）で供給済み。`client/src/app.d.ts` から `virtual:nfp/mode` 宣言を削除し、`declare const __NFP_STATIC__: boolean;`（global）を追加。`runtime-mode.dev.test.ts`/`runtime-mode.build.test.ts` は `__NFP_STATIC__` を define する Vitest 設定（`define` または `vi.stubGlobal`）に更新。

- [ ] **Step 3: テスト**

Run: `vp test --project @note-first-presenter/client -t runtime-mode`
Expected: dev/build の URL 切替が PASS。

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "refactor: replace virtual:nfp/mode with __NFP_STATIC__ define"
```

### Task 2.6: SPA ビルド + 200.html フォールバック

**Files:**

- Modify: `packages/note-first-presenter/src/build.ts`
- Modify: `packages/client/package.json`（adapter-\* 撤去）

- [ ] **Step 1: build.ts に 200.html コピーを追加**

`vite build` 後・`writeBuildData` の前後で:

```ts
await fs.copyFile(path.join(outDir, 'index.html'), path.join(outDir, '200.html'));
```

（既存の `writeBuildData(...)` 呼び出しは維持。`process.env.NFP_*` 関連は Task 2.1 で撤去済み。）

- [ ] **Step 2: adapter 依存を撤去**

`@sveltejs/adapter-static`・`@sveltejs/adapter-auto`・`@sveltejs/kit` を client の依存から削除（`vp remove` を使用）。`svelte-check` は Svelte 単体の型チェックに切替（`svelte-check` 自体は残置可）。

- [ ] **Step 3: 静的 build を手動確認**

```bash
( cd e2e/fixtures/basic && pnpm exec note-first-presenter build --out-dir dist )
ls dist/index.html dist/200.html dist/nfp-data/meta.json
```

Expected: `index.html`・`200.html`・`nfp-data/*` が出力される。

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "feat: spa build with 200.html fallback, drop sveltekit adapters"
```

### Task 2.7: 統合検証

- [ ] **Step 1: 静的解析・型・整形**

Run: `vp check`
Expected: PASS（Oxlint/Oxfmt/型）。

- [ ] **Step 2: 全ユニットテスト**

Run: `vp test`
Expected: 全 PASS。

- [ ] **Step 3: e2e**

Run: `pnpm test:e2e`
Expected: dev サーバ + ミドルウェア + SPA で全 PASS。

- [ ] **Step 4: dev の手動確認**

```bash
( cd e2e/fixtures/basic && pnpm exec note-first-presenter --port 5199 ) &
```

Expected: `/` で Presenter、`/slideshow` で Slideshow が表示。outline 編集が保存され、スライド画像が出る。`?slide=N` がスライド移動で更新される。ブラウザ言語 ja/en で表示が切替。

- [ ] **Step 5: 最終コミット**

```bash
git add -A && git commit -m "test: verify spa rearchitecture (dev/build/e2e)"
```

---

## Self-Review チェック

- **スペック網羅**: §4 API（Task 1.3）/ §5 mode（Task 2.5）/ §6 ルーティング（Task 2.2,2.4）/ §7 i18n（Task 2.3）/ §8 ビルド（Task 2.6）/ §9 db 契約（Task 1.1,1.3）/ §10 影響ファイル（File Structure）を各タスクが担保。
- **型整合**: `DbInput`/`emptyDb`（cli）、`DbV1`/`defaultDb`（client 残置）、`__NFP_STATIC__`（define）、`createApiMiddleware`/`ApiContext`、`createViteConfig`/`NfpViteConfigInput` が前後で一致。
- **未決事項**: なし（ルーティング・db デフォルト・URL 規約は設計で確定済み）。
