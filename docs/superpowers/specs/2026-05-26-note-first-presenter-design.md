# note-first-presenter 設計ドキュメント

- 作成日: 2026-05-26
- 対象: MVP（最小機能版）
- ステータス: 設計確定

## 1. 目的とスコープ

### 1.1 目的

`note-first-presenter` は「ノートを書きながらスライドを進めるプレゼンテーション制作・進行ツール」。発表者は既存の PDF スライドを素材としてそのまま使い、各スライドに紐づくノートをアウトライナーで書き、本番ではブラウザのスライドショーを別ウィンドウで制御する。

### 1.2 ターゲットユーザー

- ノートを構造的に書きたい発表者
- 既存の PDF スライド資産を活かしたい発表者
- git でプレゼン関連ファイルを管理したい開発者

### 1.3 MVP に含む

- モノレポ基盤（pnpm workspace、Vite+、vitefu）
- パッケージ: `packages/note-first-presenter`（CLI + Vite plugin）、`packages/client`（SvelteKit アプリ本体）
- CLI: `note-first-presenter`（dev サーバー起動のみ）、フラグ `--port` / `--open` / `--host` / `--help` / `--version`
- スライド入力: **PDF のみ**。config の `slides` パス or プロジェクトルートからの自動検出
- スライドのレンダリング: `pdfjs-dist` + `@napi-rs/canvas` を SvelteKit `+server.ts` 内でサーバーサイド利用、`node_modules/.note-first-presenter/slides/{sha256}/{NNNN}.webp` に永続キャッシュ、初回リクエスト時のみ生成
- presenter view: `/` パス。ヘッダー（タイトル編集・スライドショーリンク・テーマ切替・スライドリスト開閉）、左ペインに ProseMirror ベースの outliner、右ペインに slide list（WAI-ARIA listbox）
- slideshow view: `/slideshow` パス。スライド画像のみを最大化表示、`←/→/↑/↓` キーで自ページ navigation、テーマは dark 固定
- outliner: Workflowy 同等のキーマップとノード選択機能、装飾なし、ズームなし、検索なし、completed なし、ドラッグ&ドロップなし、ペーストは plain text のインデント検出 + HTML `<ul>/<ol>/<li>` 検出
- スライドとノートの対応: トップレベル項目で text が `---` の項目を区切りとして、各グループがスライド N のノート。ノートグループ数 > スライド数の場合は超過分にダミースライド
- アクティブスライド: editor caret position と listbox selection の双方が更新源（双方の最終操作が勝つ）。URL `?slide=N`（1 オリジン）に反映。`BroadcastChannel` で presenter → slideshow に一方向同期
- DB: `.note-first-presenter.json`（プロジェクト直下、JSON pretty-print + 末尾改行、git でコミットされる前提）。500ms デバウンスで自動保存、ラスト・ライト・ウィンズ、不在時は空アウトラインで起動して最初の編集で初回保存
- config: `note-first-presenter.config.ts` または `.js`（Vite の `loadConfigFromFile` で読み込み）。`defineConfig` ヘルパーで型補完。仕様にある全項目スキーマを MVP で定義（build/export は未実装でもシグネチャは用意）
- i18n: Paraglide JS v2（`@inlang/paraglide-js` + `paraglideVitePlugin`）、ja/en、`baseLocale: en`、strategy = `['preferredLanguage', 'baseLocale']`。SSR では `Accept-Language` ヘッダで locale を確定し `<html lang dir>` を `%paraglide.lang%` / `%paraglide.dir%` プレースホルダー経由で `hooks.server.ts` の `paraglideMiddleware` が出力。クライアントは `navigator.languages` で自動解決（手動 `setLocale` 不要）。URL-prefix なし
- テーマ: presenter は system/light/dark（`<html data-theme>` + CSS 変数）、永続化は `localStorage`。slideshow は dark 固定
- HTTP クライアント: `ofetch`
- 検証ライブラリ: `valibot`
- テスト: Vitest（unit/integration/component、browser mode 含む。`vp test` 経由で実行、設定は `vite.config.ts` の `test:` ブロック）+ Playwright（cross-tab E2E）。サフィックス規約 `*.test.ts` / `*.svelte.test.ts` / `*.e2e.ts`。E2E は `src/routes/` に co-located
- ブラウザ対応: 最新 2 バージョンの Chrome / Firefox / Safari / Edge
- ファイル変更の動的再評価: PDF 中身・PDF 追加削除・config 変更を chokidar で watch し、変化時に full-reload

### 1.4 MVP に含めない（将来 spec / plan サイクルで扱う）

- **PPTX 対応** — PDF のみで開始。サーバー側 LibreOffice 経由で PPTX → PDF に変換して既存パイプラインに合流させる路線を想定
- **`note-first-presenter build`** — production 静的ビルド。出力先は config の `build.outDir`（MVP ではスキーマのみ定義）
- **`note-first-presenter export`** — eta テンプレートを使った任意形式エクスポート。config の `export.outDir` / `export.imageDir` / `export.format`（スキーマのみ MVP で定義）
- **`packages/create-app`** — `npm init` / `pnpm create` から呼ばれるジェネレーター
- **outliner の追加機能** — インライン装飾（bold/italic/link）、ズーム、タグ、ミラー、検索、completed、ドラッグ&ドロップ並べ替え、sub-notes
- **アクティブスライド双方向同期** — slideshow view 上の矢印キー操作は slideshow ローカルのみ、presenter への push-back は行わない
- **マルチデバイス対応** — `BroadcastChannel` は同一ブラウザ内のみ。別デバイスのリモコン用途は SSE / WebSocket 化が必要
- **複数 presenter view の協調編集** — 並行編集はラスト・ライト・ウィンズで割り切る
- **キャッシュ GC ポリシー** — 単一アクティブハッシュ方式で MVP 動作上は問題なし。古いキャッシュの累積管理（LRU、TTL など）は対象外
- **multi-presentation サポート** — 1 プロジェクトに対し PDF は 1 つ前提
- **言語の手動切り替え UI**
- **保存状態の常時インジケーター** — エラー時のみ表示
- **モバイル / タッチデバイス最適化**

## 2. リポジトリ構成

### 2.1 トップレベル

```
note-first-presenter/
├── package.json                    # ルート、private、pnpm workspace
├── pnpm-workspace.yaml             # 既存
├── vite.config.ts                  # 既存（Vite+ ルート設定）
├── tsconfig.json
├── packages/
│   ├── note-first-presenter/       # CLI + Vite plugin
│   └── client/                     # SvelteKit アプリ本体
├── docs/
│   └── superpowers/specs/          # 設計ドキュメント
└── .note-first-presenter.json      # 利用者プロジェクトに置かれる DB（このリポジトリ内では fixtures から起動するため、ここに固定では置かない）
```

### 2.2 `packages/note-first-presenter`

利用者が `npm i note-first-presenter` でインストールするパッケージ。

```
packages/note-first-presenter/
├── package.json                    # bin: { "note-first-presenter": "dist/cli.mjs" }
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── cli.ts                      # エントリ。フラグパース、サーバー起動
│   ├── server.ts                   # programmatic な Vite/SvelteKit dev server 起動
│   ├── config/
│   │   ├── load-config.ts
│   │   ├── resolve-slides-path.ts
│   │   ├── schema.ts
│   │   └── __tests__/
│   ├── plugin/
│   │   ├── index.ts
│   │   ├── virtual-modules.ts
│   │   ├── file-watchers.ts        # chokidar による動的再評価
│   │   └── __tests__/
│   └── index.ts                    # public API: defineConfig
└── README.md
```

提供物:

- `note-first-presenter` バイナリ
- Vite plugin
- `defineConfig` ヘルパー

### 2.3 `packages/client`

```
packages/client/
├── package.json
├── svelte.config.js
├── vite.config.ts                    # SvelteKit plugin / Paraglide plugin / Vitest 設定（test:）
├── playwright.config.ts
├── tsconfig.json
├── messages/                         # Paraglide メッセージ。package root に置く（Paraglide 慣習）
│   ├── en.json
│   └── ja.json
├── project.inlang/
│   └── settings.json                 # baseLocale / locales / プラグイン定義
├── static/                           # favicon など。SvelteKit 標準位置
│   └── favicon.svg
├── src/
│   ├── app.html                      # <html lang="%paraglide.lang%" dir="%paraglide.dir%">、data-sveltekit-preload-data="hover"
│   ├── app.css
│   ├── hooks.server.ts               # paraglideMiddleware で SSR 時の locale / lang / dir を確定
│   ├── lib/
│   │   ├── paraglide/                # paraglideVitePlugin による生成物（gitignore 対象）
│   │   ├── theme/
│   │   │   ├── theme-store.svelte.ts
│   │   │   └── apply-theme.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── client.ts           # ofetch 経由
│   │   │   └── __tests__/
│   │   ├── outliner/
│   │   │   ├── schema.ts
│   │   │   ├── separator.ts
│   │   │   ├── active-slide.ts
│   │   │   ├── Outliner.svelte
│   │   │   ├── plugins/
│   │   │   │   ├── keymap.ts
│   │   │   │   ├── node-selection.ts
│   │   │   │   ├── separator-decorations.ts
│   │   │   │   └── paste.ts
│   │   │   ├── commands/
│   │   │   ├── serialization/
│   │   │   └── __tests__/
│   │   ├── slide-list/
│   │   │   ├── SlideList.svelte
│   │   │   ├── slide-list-store.svelte.ts
│   │   │   └── __tests__/
│   │   ├── slide-image/
│   │   │   ├── SlideImage.svelte
│   │   │   └── __tests__/
│   │   ├── slide-status/
│   │   │   ├── SlideListErrorOverlay.svelte
│   │   │   ├── SlideListHint.svelte
│   │   │   ├── SlideshowFallback.svelte
│   │   │   ├── slide-status-store.svelte.ts
│   │   │   └── __tests__/
│   │   ├── sync/
│   │   │   ├── sync-publisher.ts
│   │   │   ├── sync-subscriber.ts
│   │   │   ├── messages.ts
│   │   │   └── __tests__/
│   │   ├── server-client.ts        # ofetch 統一インスタンス
│   │   └── server/
│   │       ├── pdf-renderer.ts
│   │       ├── slide-cache.ts
│   │       ├── db-io.ts
│   │       └── __tests__/
│   │           └── fixtures/
│   │               └── sample.pdf
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte              # / = presenter view
│       ├── +page.svelte.e2e.ts       # presenter view 用 Playwright E2E（co-located）
│       ├── presenter-flow.e2e.ts     # route 横断 cross-tab E2E
│       ├── slideshow-sync.e2e.ts
│       ├── slide-rendering.e2e.ts
│       ├── slideshow/
│       │   ├── +page.svelte          # /slideshow
│       │   └── +page.svelte.e2e.ts   # slideshow view 用 Playwright E2E
│       └── api/
│           ├── slide/
│           │   └── [hash]/
│           │       └── [n]/
│           │           └── +server.ts
│           ├── slides/
│           │   └── meta/
│           │       └── +server.ts
│           └── db/
│               └── +server.ts
├── tests/
│   └── fixtures/                     # Playwright webServer の cwd ターゲット用プロジェクト雛形
│       ├── basic/
│       ├── configured/
│       ├── multiple-pdfs/
│       └── empty/
└── README.md
```

### 2.4 パッケージ依存関係

```
@note-first-presenter/client  ──┐
                                ↓ runtime import（SvelteKit ソース）
note-first-presenter ───────────┘
        │
        └ peerDependencies: @note-first-presenter/client
```

CLI が dev server を programmatic に起動するとき、`packages/client/` を root として Vite を起動する。利用者プロジェクトでは両方が `node_modules/` に展開される。

### 2.5 vitefu の利用箇所

- `findClosestPkgJsonPath` — `packages/client` のインストール先解決（CLI から SvelteKit プロジェクトルートを動的に特定）
- `crawlFrameworkPkgs` — 必要なら Vite plugin の deps 設定で利用

## 3. CLI

### 3.1 コマンド

| コマンド                         | 振る舞い                             |
| -------------------------------- | ------------------------------------ |
| `note-first-presenter`           | dev サーバー起動（MVP の唯一の機能） |
| `note-first-presenter --help`    | 使い方表示して exit 0                |
| `note-first-presenter --version` | バージョン表示して exit 0            |

### 3.2 フラグ

| フラグ                  | デフォルト  | 振る舞い                                                      |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| `--port <n>` / `-p <n>` | `5173`      | 指定ポートで起動。使用中なら自動で空きを探す（Vite 標準挙動） |
| `--open` / `-o`         | false       | 起動後、デフォルトブラウザで `/` を開く                       |
| `--host <host>`         | `localhost` | バインドホスト指定。`0.0.0.0` で LAN 公開可能                 |
| `--help` / `-h`         | —           | フラグ一覧表示                                                |
| `--version` / `-v`      | —           | バージョン表示                                                |

### 3.3 起動シーケンス

1. CLI 引数 parse（`--help` / `--version` は即時 exit）
2. `cwd = process.cwd()`（= 利用者プロジェクトルート）
3. config 読み込み: `note-first-presenter.config.{ts,js}` を順に探し、Vite の `loadConfigFromFile` で読み込み
4. slides パス解決: config or auto-detect。物理ファイルの中身は読まない
5. SvelteKit dev server を programmatic 起動: `packages/client` を root にして `vite.createServer({ ..., plugins: [..., noteFirstPresenterPlugin({ cwd, config, slidesStatus })] })`
6. URL を stdout 表示し、Ctrl+C で graceful shutdown

### 3.4 終了コード

| 状況                          | exit code            |
| ----------------------------- | -------------------- |
| 通常終了（Ctrl+C）            | 0                    |
| `--help` / `--version`        | 0                    |
| 未知のフラグ                  | 1 + usage 表示       |
| config ファイルのパースエラー | 1 + エラーメッセージ |
| ポートバインド失敗            | 1                    |
| 起動後の予期せぬ例外          | 1                    |

`slides` パス解決時の「ファイル不在」「複数 PDF」「config 未設定 + ファイルなし」は CLI を exit させず、ブラウザ側で UI 表示する。

### 3.5 引数パーサー

`citty`（unjs）。理由: モダン ESM 前提、自動 help/version 生成、型安全。

### 3.6 stdout / stderr

通常メッセージは stdout、エラーは stderr。ロガーは Vite の `createLogger` を借りる。

## 4. 設定ファイル

### 4.1 ファイル名

`note-first-presenter.config.ts`（優先）または `note-first-presenter.config.js`。両方ある場合は `.ts` を優先。

### 4.2 公開 API

```ts
import { defineConfig } from 'note-first-presenter';

export default defineConfig({
  slides: './slides/main.pdf',
});
```

`defineConfig` は pass-through ヘルパー（型推論のため）。

### 4.3 スキーマ

```ts
export type NoteFirstPresenterConfig = {
  /**
   * Path to the source PDF.
   * Relative paths resolve from the config file's directory.
   * If omitted, the project root is scanned for *.pdf (single match auto-selected).
   */
  slides?: string;

  /** Future: `note-first-presenter build` output. Not consumed by the MVP. */
  build?: {
    outDir?: string; // default: 'dist'
  };

  /** Future: `note-first-presenter export` settings. Not consumed by the MVP. */
  export?: {
    outDir?: string;
    imageDir?: string;
    format?: {
      template: string;
      extension: string;
    };
  };
};

export function defineConfig(config: NoteFirstPresenterConfig): NoteFirstPresenterConfig;
```

### 4.4 config 読み込み

Vite の `loadConfigFromFile` を使う。MVP では `.ts` と `.js` の 2 種類のみ試す。

```ts
for (const name of ['note-first-presenter.config.ts', 'note-first-presenter.config.js']) {
  const fullPath = path.join(cwd, name);
  if (!existsSync(fullPath)) continue;
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, fullPath, cwd);
  if (!loaded) continue;
  validateConfig(loaded.config); // valibot
  return { config: loaded.config, filePath: fullPath };
}
return { config: null, filePath: null };
```

### 4.5 slides パス解決

```ts
export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };
```

ロジック:

1. config に明示パスがあれば、config ファイルのディレクトリからの相対パスで absolute 化、存在確認
2. なければ cwd 直下を `*.pdf` で glob（サブディレクトリは見ない）
3. 結果に応じて状態を返す

### 4.6 SvelteKit 側への伝達

仮想モジュール `virtual:nfp/runtime-config` 経由:

```ts
export interface NfpRuntimeConfig {
  cwd: string;
  slidesStatus: SlidesStatus;
  dbPath: string; // path.join(cwd, '.note-first-presenter.json')
  cacheRoot: string; // path.join(cwd, 'node_modules', '.note-first-presenter')
  fullConfig: NoteFirstPresenterConfig | null;
}
```

サーバー側コードは `import config from 'virtual:nfp/runtime-config'` で取得。

## 5. DB と永続化

### 5.1 ファイル仕様

- パス: cwd 直下 `.note-first-presenter.json`
- フォーマット: JSON、2 スペースインデント pretty-print、末尾改行 1 行
- 文字エンコーディング: UTF-8（BOM なし）
- git でコミットされる前提

### 5.2 スキーマ

```ts
export interface DbV1 {
  version: 1;
  title: string; // 空文字 OK
  outline: ProseMirrorDoc; // ProseMirror JSON ドキュメント
}
```

### 5.3 ProseMirror schema（outliner 用）

```ts
{
  nodes: {
    doc: { content: 'bullet_list?' },
    bullet_list: { content: 'list_item+', group: 'block' },
    list_item: {
      content: 'paragraph bullet_list?',
      attrs: { collapsed: { default: false } },
    },
    paragraph: { content: 'text*', marks: '' },
    text: { group: 'inline' },
  },
  marks: {},
}
```

- ルートは `bullet_list` 0 or 1
- `marks: ''` でプレーンテキスト保証

### 5.4 初期状態

DB ファイルが存在しないとき:

```json
{
  "version": 1,
  "title": "",
  "outline": { "type": "doc", "content": [] }
}
```

- メモリ上に default を持つ
- 物理ファイルは作成しない
- 最初の編集 → 自動保存トリガーで初回 `fs.writeFile`

### 5.5 エンドポイント

```
GET  /api/db   → 現在の DB（ファイルなければ default）
PUT  /api/db   → リクエスト body 全体で置換
```

valibot で軽くシェイプチェック:

```ts
import * as v from 'valibot';

const dbSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const parsed = v.parse(dbSchema, body);
  await writeDb(parsed);
  return new Response(null, { status: 204 });
};
```

### 5.6 サーバー側 I/O

```ts
export async function readDb(): Promise<DbV1> {
  try {
    return JSON.parse(await fs.readFile(dbPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return defaultDb();
    throw err;
  }
}

export async function writeDb(db: DbV1): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
}
```

並行 PUT は `fs.writeFile` の単位 atomicity に任せる。

### 5.7 ブラウザ側自動保存

```ts
import { api } from '$lib/server-client';

class DbStore {
  state = $state<DbV1>(/* GET /api/db */);
  saveStatus = $state<'idle' | 'saving' | 'error'>('idle');
  lastError = $state<string | null>(null);

  private timer: number | null = null;

  setTitle(title: string) {
    this.state.title = title;
    this.scheduleSave();
  }

  setOutline(doc: ProseMirrorDoc) {
    this.state.outline = doc;
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  private async flush() {
    this.saveStatus = 'saving';
    try {
      await api('/api/db', { method: 'PUT', body: this.state });
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }
}
```

- 500ms デバウンス
- 連続編集中は最後の編集から 500ms 待ってまとめて PUT
- ページ離脱前に `beforeunload` で best-effort flush
- 保存中インジケーターは**エラー時のみ** presenter view ヘッダー右に表示

### 5.8 ロード

- presenter view マウント時に `GET /api/db` で初期状態取得
- slideshow view は DB 内容を取得しない

### 5.9 マイグレーション

MVP は `version: 1` のみ。将来 schema 変更時に対応。

## 6. PDF レンダリングパイプライン

### 6.1 全体フロー

```
ブラウザ（presenter / slideshow view）
  GET /api/slides/meta → { pageCount, hash }
  GET /api/slide/{hash}/{n} → image/webp
    ↓
SvelteKit +server.ts
  pdfP ??= loadAndHash()        # 初回のみ。pruneOtherHashes 含む
  ↓
  キャッシュファイル存在 → fs.readFile して返す
  なし → pdfjs-dist + @napi-rs/canvas でレンダリング → cache に保存 → 返す
```

### 6.2 サーバー側ロジック

```ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist';
import { createCanvas } from '@napi-rs/canvas';
import { cacheRoot, slidesStatus } from 'virtual:nfp/runtime-config';

let pdfP: Promise<{ hash: string; pdf: pdfjs.PDFDocumentProxy; pageCount: number }> | null = null;

function getPdf() {
  pdfP ??= loadAndHash();
  return pdfP;
}

async function loadAndHash() {
  if (slidesStatus.kind !== 'resolved') throw new SlidesUnavailableError(slidesStatus);
  const bytes = await fs.readFile(slidesStatus.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await pruneOtherHashes(hash);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  return { hash, pdf, pageCount: pdf.numPages };
}

async function pruneOtherHashes(currentHash: string) {
  const slidesDir = path.join(cacheRoot, 'slides');
  try {
    const entries = await fs.readdir(slidesDir);
    await Promise.all(
      entries
        .filter((name) => name !== currentHash)
        .map((name) => fs.rm(path.join(slidesDir, name), { recursive: true, force: true })),
    );
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
}

function slideCachePath(hash: string, n: number): string {
  return path.join(cacheRoot, 'slides', hash, `${String(n).padStart(4, '0')}.webp`);
}

export async function getSlideImage(
  n: number,
): Promise<{ data: Buffer; hash: string; pageCount: number }> {
  const { hash, pdf, pageCount } = await getPdf();
  if (n < 1 || n > pageCount) throw new PageOutOfRangeError(n, pageCount);

  const cachePath = slideCachePath(hash, n);
  try {
    return { data: await fs.readFile(cachePath), hash, pageCount };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const data = await renderPage(pdf, n);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, data);
  return { data, hash, pageCount };
}

async function renderPage(pdf: pdfjs.PDFDocumentProxy, n: number): Promise<Buffer> {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: TARGET_SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport })
    .promise;
  return canvas.encode('webp', WEBP_QUALITY);
}

const TARGET_SCALE = 2.0;
const WEBP_QUALITY = 85;
```

### 6.3 エンドポイント

```ts
// packages/client/src/routes/api/slide/[hash]/[n]/+server.ts
export const GET: RequestHandler = async ({ params, setHeaders }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return new Response('invalid page', { status: 400 });
  try {
    const { data, hash } = await getSlideImage(n);
    if (params.hash !== hash) return new Response('hash mismatch', { status: 404 });
    setHeaders({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${hash}-${n}"`,
    });
    return new Response(data);
  } catch (err) {
    if (err instanceof SlidesUnavailableError) {
      return new Response(JSON.stringify(err.toJSON()), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (err instanceof PageOutOfRangeError) return new Response('out of range', { status: 404 });
    throw err;
  }
};
```

URL に hash を含めることで、PDF が差し替わり hash が変わった時にブラウザ HTTP キャッシュも自動無効化される。

### 6.4 meta エンドポイント

```
GET /api/slides/meta
```

レスポンス:

- `resolved` → 200 + `{ status: 'resolved', hash, pageCount }`
- それ以外 → 422 + `{ status: ..., ...詳細 }`

### 6.5 ブラウザ側

- ビュー初期化時に `GET /api/slides/meta` を ofetch で叩く
- `meta.pageCount` から `<img src="/api/slide/{hash}/{n}">` を必要分配置
- presenter のスライドリスト: 全ページ分のサムネイル `<img loading="lazy">`
- slideshow: アクティブ 1 枚 + 前後 ±2 ページを `<link rel="preload" as="image">` で先読み

### 6.6 PDF 変更の即時反映

```ts
// packages/note-first-presenter/src/plugin/file-watchers.ts
import chokidar from 'chokidar';

export function initFileWatchers(args: { cwd: string; vite: ViteDevServer; onChange: () => void }) {
  // 1. プロジェクトルート直下の *.pdf 追加/削除
  const rootWatcher = chokidar.watch('*.pdf', {
    cwd: args.cwd,
    depth: 0,
    ignoreInitial: true,
  });
  rootWatcher.on('add', args.onChange);
  rootWatcher.on('unlink', args.onChange);

  // 2. config ファイル
  const configWatcher = chokidar.watch(
    [
      path.join(args.cwd, 'note-first-presenter.config.ts'),
      path.join(args.cwd, 'note-first-presenter.config.js'),
    ],
    { ignoreInitial: true },
  );
  configWatcher.on('add', args.onChange);
  configWatcher.on('change', args.onChange);
  configWatcher.on('unlink', args.onChange);

  // 3. 解決済み PDF の中身
  if (slidesStatus.kind === 'resolved') {
    const pdfWatcher = chokidar.watch(slidesStatus.path, {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    pdfWatcher.on('change', args.onChange);
  }
}

function onChange() {
  pdfP = null;
  slidesStatus = recomputeSlidesStatus(cwd, config);
  vite.ws.send({ type: 'full-reload' });
}
```

ユーザーが PDF を追加/削除/編集 → 即座に full-reload で UI が追随。

### 6.7 キャッシュ整合性

- ファイルハッシュベース
- 単一アクティブハッシュ方式: 新しい hash の dir を作る直前に他の hash dir をすべて削除
- TTL / LRU は実装しない

## 7. presenter view（`/`）

### 7.1 レイアウト

```
┌──────────────────────────────────────────────────────────────────┐
│ [title input] [save error] [▶ Slideshow] [theme] [list▸]         │
├──────────────────────────────────────────────────────────────────┤
│                                  │                                │
│  Outliner                        │  Slide List (listbox)          │
│  (ProseMirror)                   │                                │
│                                  │  [thumb 1] *                   │
│                                  │  [thumb 2]                     │
│                                  │  ...                           │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 ヘッダー要素

- **タイトル input**: 常時編集可能な `<input>`、見た目は `h1` 風。空のとき locale プレースホルダー（"Untitled" / "無題"）。`input` イベントごとに `dbStore.setTitle()` → 500ms デバウンス保存
- **保存エラー表示**: `dbStore.saveStatus === 'error'` のときだけ可視。aria-live="polite"
- **スライドショーリンク**: `<a href="/slideshow?slide={activeSlide}" target="nfp-slideshow" rel="noopener">▶ Slideshow</a>`。名前付き target で同じウィンドウを使い回す
- **テーマセグメント**: 3 状態ラジオ（system / light / dark）、`localStorage` に永続化
- **スライドリスト開閉ボタン**: `aria-expanded` 付き toggle button、状態を `localStorage` に永続化

### 7.3 outliner ペイン

Section 9 のコンポーネントとして:

```svelte
<Outliner
  doc={dbStore.state.outline}
  onChange={(doc) => dbStore.setOutline(doc)}
  onActiveSlideChange={(n) => activeSlideStore.setFromEditor(n)}
/>
```

### 7.4 slide list ペイン

Section 8 のコンポーネントとして:

```svelte
<SlideList
  hash={slidesMeta.hash}
  pageCount={effectivePageCount}
  overflowStart={pdfPageCount + 1}
  activeSlide={activeSlideStore.value}
  onSelect={(n) => activeSlideStore.setFromList(n)}
/>
```

### 7.5 状態管理

ページ単位の root ストア（`PresenterPageStore`）を `+page.svelte` で 1 度生成し、context で配下に渡す。子ストア: `DbStore`、`ThemeStore`、`SlidesMetaStore`、`ActiveSlideStore`、`SyncPublisher`、`ToggleStore`（スライドリスト開閉）。

### 7.6 URL 同期

- マウント時に `?slide=N` を読み、`activeSlide` の初期値に。なければ 1
- `activeSlide` 変化 → `replaceState` で `?slide=N` を書き換え
- 戻る/進むで URL が変わったら `activeSlide` に反映

### 7.7 BroadcastChannel 連動

`SyncPublisher` で `activeSlide.value` 変化を `nfp:active-slide` チャンネルに post。slideshow からの push-back はなし（一方向）。

### 7.8 キーボード

- 矢印キー `←/→` は presenter view グローバルでは listen しない（outliner や listbox のスコープで処理）
- listbox にフォーカス時は `↑/↓` で active 切替

### 7.9 レスポンシブ

ブレークポイントなし。`min-width` の控えめな設定のみ（outliner 240px、スライドリスト 240px）。狭くなったら横スクロールで対応、メッセージは出さない。

## 8. slideshow view（`/slideshow`）

### 8.1 レイアウト

- 黒背景画面全体
- 中央にスライド画像 1 枚を `object-fit: contain`
- ヘッダー・フッターなし
- マウスカーソルは 5 秒操作がないと自動非表示

### 8.2 テーマ

dark 固定。`<html data-theme="dark">` を強制、presenter のテーマ設定は参照しない。

### 8.3 状態の流れ

- URL `?slide=N` から初期 active
- `nfp:active-slide` チャンネルから受信 → URL 更新 → render 更新
- ローカル ←/→ などで操作 → URL 更新 → render 更新（broadcast には流さない）

### 8.4 キーボード

| キー                                 | 動作                                   |
| ------------------------------------ | -------------------------------------- |
| `→` / `↓` / `Space` / `PageDown`     | 次のスライド                           |
| `←` / `↑` / `Shift+Space` / `PageUp` | 前のスライド                           |
| `Home`                               | 先頭                                   |
| `End`                                | 最終                                   |
| 任意のキー                           | カーソル可視化（5 秒タイマーリセット） |

ハンドラは `window.addEventListener('keydown')`。

### 8.5 マウス

- クリック: 次のスライド
- スクロール: なし
- 右クリックは標準のコンテキストメニューに任せる

### 8.6 状態管理

```ts
class SlideshowPageStore {
  readonly slidesMeta = new SlidesMetaStore();
  readonly activeSlide = new ActiveSlideStore();
  readonly sync = new SyncSubscriber();
  readonly cursorVisible = $state(true);

  constructor() {
    this.sync.subscribe((msg) => {
      if (msg.type === 'active-slide') this.activeSlide.set(msg.slide);
    });
  }
}
```

### 8.7 preload

現在のスライドに加え、±2 ページを `<link rel="preload" as="image">` で先読み。

### 8.8 overflow

`effectivePageCount` に揃え、N が overflow なら画像 fetch せずプレースホルダーを表示。

### 8.9 エラー / 空状態

Section 13 に揃え、中央にメッセージ表示。

## 9. outliner（ProseMirror）

### 9.1 採用ライブラリ

- `prosemirror-model`、`prosemirror-state`、`prosemirror-view`、`prosemirror-transform`、`prosemirror-commands`、`prosemirror-history`、`prosemirror-keymap`、必要なら `prosemirror-schema-list`

### 9.2 スキーマ（再掲）

Section 5.3 を参照。プレーンテキスト + 階層ノードのみ、装飾なし。

### 9.3 セパレータ判定

```ts
export function isTopLevelSeparator(item: Node): boolean {
  if (item.type.name !== 'list_item') return false;
  const first = item.firstChild;
  if (first?.type.name !== 'paragraph') return false;
  return first.textContent === '---';
}
```

セパレータはあくまで runtime ルール。専用ノード型は作らない。`---` を持つ通常のバレットとして扱う（編集・移動・削除等もすべて通常通り）。

### 9.4 Svelte ラッパー

```svelte
<script lang="ts">
  import { EditorState } from 'prosemirror-state'
  import { EditorView } from 'prosemirror-view'

  let { doc, onChange, onActiveSlideChange } = $props()
  let mountEl: HTMLDivElement
  let view: EditorView | null = null

  $effect(() => {
    const state = EditorState.create({
      schema: outlinerSchema,
      doc: outlinerSchema.nodeFromJSON(doc),
      plugins: [history(), outlinerKeymap(), separatorDecorations, /* ... */],
    })
    view = new EditorView(mountEl, {
      state,
      dispatchTransaction(tr) {
        const next = view!.state.apply(tr)
        view!.updateState(next)
        if (tr.docChanged) onChange(next.doc.toJSON())
        if (tr.docChanged || tr.selectionSet) {
          onActiveSlideChange(computeActiveSlide(next.doc, next.selection))
        }
      },
    })
    return () => { view?.destroy(); view = null }
  })
</script>

<div bind:this={mountEl} class="outliner-root" />
```

### 9.5 キーマップ

`prosemirror-keymap` で組む。`Mod-` で吸収できる部分は共通、Mac だけ別の物理キー（バレット上下移動 `Cmd+Shift+↑/↓`）は platform 判定で分岐。User Agent 検出には `bowser` を使う（`navigator.platform` は非推奨化が進んでおり、UA 解析専用ライブラリの方が正確で将来安定）:

```ts
import Bowser from 'bowser';

const isMac = Bowser.getParser(navigator.userAgent).getOSName() === 'macOS';

keymap({
  // 共通
  Enter: insertSiblingItem,
  'Shift-Enter': insertLineBreak,
  Tab: indentItem,
  'Shift-Tab': outdentItem,
  Backspace: smartBackspace,
  Delete: smartDelete,
  'Mod-Z': undo,
  'Mod-Shift-Z': redo,
  'Mod-A': selectAllInContext,
  'Mod-ArrowUp': collapseItem,
  'Mod-ArrowDown': expandItem,
  'Mod-Shift-D': duplicateItem,
  // 物理キーが Mac と Win/Linux で違うもの
  ...(isMac
    ? {
        'Mod-Shift-ArrowUp': moveItemUp,
        'Mod-Shift-ArrowDown': moveItemDown,
      }
    : {
        'Alt-Shift-ArrowUp': moveItemUp,
        'Alt-Shift-ArrowDown': moveItemDown,
        'Ctrl-Y': redo, // Win 慣習の追加
      }),
});
```

### 9.6 主要コマンド

`packages/client/src/lib/outliner/commands/` 配下に 1 コマンド 1 ファイル:

- `indentItem` / `outdentItem`
- `moveItemUp` / `moveItemDown`
- `insertSiblingItem`（Enter / 分割含む）
- `smartBackspace`（先頭で結合 / 空で削除）
- `smartDelete`
- `collapseItem` / `expandItem`
- `duplicateItem`
- ノード選択拡張系（`extendNodeSelectionUp/Down` 等）

### 9.7 ノード選択モード

ProseMirror の `NodeSelection` に加え、連続兄弟の範囲を表す `NodeRangeSelection` を自作:

- バレットハンドル `Click` → 単独 `NodeSelection`
- `Shift+Click` → `NodeRangeSelection`
- テキスト選択中の `Shift+ArrowUp/Down` で範囲が item を超えたら `NodeRangeSelection` に切替
- 選択中の `Tab`/`Shift+Tab`/`Alt+Shift+↑↓`/`Backspace`/`Delete` は範囲全体に適用
- 選択中 `Cmd+C/X/V` はバレットツリーをクリップボードへ

`Decoration` で選択中 `<li>` に `.is-selected` クラスを付与。

### 9.8 折りたたみ + アニメーション

- `list_item.attrs.collapsed`（boolean、default false）
- DOM: `<li data-collapsed="true|false">`
- `collapseItem` / `expandItem` で属性切替

CSS（モダン: `interpolate-size` + `@starting-style` + `transition-behavior: allow-discrete`）:

```css
:root {
  interpolate-size: allow-keywords;
}

.outliner li > ul {
  overflow: hidden;
  transition:
    height 200ms ease,
    opacity 200ms ease,
    display 200ms allow-discrete;
}

.outliner li[data-collapsed='true'] > ul {
  display: none;
  height: 0;
  opacity: 0;
}

@starting-style {
  .outliner li:not([data-collapsed='true']) > ul {
    height: 0;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .outliner li > ul {
    transition: none;
  }
}
```

トグルボタン:

```css
.outliner li > .collapse-toggle {
  transition: transform 200ms ease;
}
.outliner li[data-collapsed='true'] > .collapse-toggle {
  transform: rotate(-90deg);
}
```

### 9.9 セパレータ視覚化

separatorDecorations プラグインがトップレベル `list_item` を走査し、セパレータ条件を満たす項目に `Decoration.node` を付与:

```ts
decos.push(
  Decoration.node(offset, offset + item.nodeSize, {
    'data-separator': 'true',
    'data-next-slide-label': m.next_slide_label({ n: nextSlide }),
  }),
);
```

CSS:

```css
.outliner > ul > li {
  margin-block: 0;
  transition:
    margin-block 200ms ease,
    color 200ms ease;
  position: relative;
}

.outliner > ul > li[data-separator='true'] {
  margin-block: 1.5em;
  color: var(--color-muted);
}

.outliner > ul > li[data-separator='true']::before {
  content: '';
  position: absolute;
  inset: 50% 0 auto 1em;
  border-top: 1px dashed var(--color-border);
  z-index: -1;
  opacity: 1;
  transition: opacity 200ms ease;
}

.outliner > ul > li[data-separator='true']::after {
  content: attr(data-next-slide-label);
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  padding-inline: 0.5em;
  background: var(--color-bg);
  font-size: 0.85em;
  color: var(--color-muted);
  opacity: 1;
  transition: opacity 200ms ease;
}

@starting-style {
  .outliner > ul > li[data-separator='true']::before,
  .outliner > ul > li[data-separator='true']::after {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .outliner > ul > li,
  .outliner > ul > li[data-separator='true']::before,
  .outliner > ul > li[data-separator='true']::after {
    transition: none;
  }
}
```

セパレータ化の瞬間、上下マージンが滑らかに広がり、水平線と次スライドラベルが fade-in。テキストを `---x` などに変えると逆方向のアニメーションで戻る。

### 9.10 ペースト

`packages/client/src/lib/outliner/plugins/paste.ts`:

1. clipboard から `application/x-nfp-outline`（内部 JSON）、`text/html`、`text/plain` を取得
2. **内部フォーマット優先**: 内部 JSON があればそれを最優先で復元
3. `text/html` に `<ul>/<ol>/<li>` があれば、再帰的に outliner schema にマップ。装飾は剥がす
4. `text/plain` 複数行: 各行から先頭マーカー（`- `, `* `, `+ `, `1. ` 等）を剥がし、最小の非ゼロインデント幅を 1 単位として相対ネストを構築
5. `text/plain` 単一行: 通常のテキストとしてカーソル位置に挿入

ペースト位置のセマンティクス: カーソルがバレット途中なら分割し、貼り付ける最初のバレットの内容を分割前半に連結、残りを後続バレットとして同階層から挿入、最後の貼り付けバレット末尾に分割後半を連結。

### 9.11 コピー / カット

- ノード選択中: `application/x-nfp-outline`（内部 JSON）と `text/plain`（Markdown ライクなインデント表現）両方を書く
- テキスト選択中: 通常のテキスト

### 9.12 IME

ProseMirror 標準。`Enter` などのキーマップは ProseMirror 標準のガードに従って IME 中には奪わない。

### 9.13 アクセシビリティ

- ルート: `<div role="textbox" aria-multiline="true" aria-label="Outliner">`
- 折りたたみトグル: `<button aria-expanded aria-label="Toggle children">`
- ノード選択時: `aria-selected="true"`

## 10. スライド ↔ ノートグループの対応

### 10.1 セパレータ判定とノートグループ

Section 9.3 の `isTopLevelSeparator` を使い、トップレベル `list_item` を走査して `---` のたびにグループ index を + 1:

```ts
export interface NoteGroup {
  slideIndex: number; // 1-origin
  itemPositions: number[];
  rangeStart: number;
  rangeEnd: number;
  precedingSeparatorPos: number | null;
}

export function deriveNoteGroups(doc: Node): NoteGroup[] {
  /* ... */
}
```

空ドキュメントは「グループ 1 つ（空）」として扱う。

### 10.2 アクティブスライド計算

```ts
export function computeActiveSlide(doc: Node, selection: Selection): number {
  const groups = deriveNoteGroups(doc);
  const caret = selection.from;
  for (const group of groups) {
    if (caret >= group.rangeStart && caret <= group.rangeEnd) {
      // caret がちょうど --- 上にある場合は「次のスライド」を返す（Q16a-A）
      return group.slideIndex;
    }
  }
  return groups.at(-1)?.slideIndex ?? 1;
}
```

### 10.3 effectivePageCount

```ts
function getEffectivePageCount(pdfPageCount: number, groupCount: number): number {
  return Math.max(pdfPageCount, groupCount);
}
```

`index > pdfPageCount` は overflow。

### 10.4 listbox からの選択

`listbox` 選択は activeSlide を更新するが、editor の caret は移動しない。後でエディタにフォーカスを戻すと、caret 位置から再度 activeSlide が計算される。

### 10.5 ActiveSlideStore

```ts
class ActiveSlideStore {
  value = $state(1);

  setFromList(n: number) {
    this.value = n;
  }
  setFromEditor(n: number) {
    this.value = n;
  }
}
```

editor からの変化と listbox からの変化が両方単純に上書きするだけ。BroadcastChannel への publish はこの value を `$effect` で watch。

### 10.6 URL 同期

```ts
constructor() {
  const urlSlide = $page.url.searchParams.get('slide')
  if (urlSlide) this.value = Math.max(1, Number(urlSlide) || 1)
  $effect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('slide', String(this.value))
    window.history.replaceState({}, '', url)
  })
}
```

### 10.7 effectivePageCount 変化時のクランプ

```ts
$effect(() => {
  const max = effectivePageCount.value;
  if (activeSlide.value > max) activeSlide.value = max;
  if (activeSlide.value < 1) activeSlide.value = 1;
});
```

## 11. ビュー間の状態同期（BroadcastChannel）

### 11.1 概要

`presenter view` → `slideshow view` の一方向 push のみ。同一ブラウザ・同一オリジン前提。

### 11.2 メッセージ仕様

チャンネル名: `nfp:active-slide`

```ts
export type SyncMessage = { type: 'active-slide'; slide: number };
```

### 11.3 送信側（presenter）

```ts
import { BROWSER } from 'esm-env';

export class SyncPublisher {
  private channel: BroadcastChannel | null = BROWSER
    ? new BroadcastChannel('nfp:active-slide')
    : null;

  publishActiveSlide(slide: number) {
    this.channel?.postMessage({ type: 'active-slide', slide } satisfies SyncMessage);
  }

  destroy() {
    this.channel?.close();
    this.channel = null;
  }
}
```

`activeSlide.value` の変化を `$effect` で watch して publish。

### 11.4 受信側（slideshow）

```ts
import { BROWSER } from 'esm-env';

export class SyncSubscriber {
  private channel: BroadcastChannel | null = BROWSER
    ? new BroadcastChannel('nfp:active-slide')
    : null;

  subscribe(handler: (msg: SyncMessage) => void) {
    if (!this.channel) return () => {};
    const listener = (ev: MessageEvent<SyncMessage>) => handler(ev.data);
    this.channel.addEventListener('message', listener);
    return () => this.channel?.removeEventListener('message', listener);
  }

  destroy() {
    this.channel?.close();
    this.channel = null;
  }
}
```

### 11.5 役割の非対称性

| ビュー    | publisher | subscriber |
| --------- | --------- | ---------- |
| presenter | ○         | ×          |
| slideshow | ×         | ○          |

slideshow の `←/→/↑/↓` などローカル navigation は broadcast しない。

### 11.6 初期同期

slideshow を後から開いた場合、過去のメッセージは届かない（BroadcastChannel は履歴なし）。代わりに:

- slideshow 起動時、URL `?slide=N` から初期 active 取得
- presenter のリンクは `href` に現在の `?slide=N` を含めて渡す

### 11.7 ライフサイクル

- presenter `+page.svelte` の `onMount` で publisher 生成、`onDestroy` で `destroy()`
- slideshow 同様に subscriber を扱う
- HMR 時のチャンネル重複は `destroy()` で確実に閉じることで回避

### 11.8 SSR

`!BROWSER` の文脈では BroadcastChannel が存在しないため `esm-env` の `BROWSER` で guard し、メソッドは NoOp。

## 12. テーマと i18n

### 12.1 テーマ

#### 12.1.1 状態と永続化

3 状態: `system` / `light` / `dark`。`localStorage` キー `nfp:theme`、初期値 `system`。

```ts
type ThemeMode = 'system' | 'light' | 'dark';

export class ThemeStore {
  mode = $state<ThemeMode>('system');
  private mql: MediaQueryList | null = null;

  readonly resolved = $derived.by<'light' | 'dark'>(() => {
    if (this.mode === 'light' || this.mode === 'dark') return this.mode;
    return this.mql?.matches ? 'dark' : 'light';
  });

  init() {
    this.mode = (localStorage.getItem('nfp:theme') as ThemeMode | null) ?? 'system';
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');

    $effect(() => {
      localStorage.setItem('nfp:theme', this.mode);
    });
    $effect(() => {
      document.documentElement.dataset.theme = this.resolved;
    });

    this.mql.addEventListener('change', () => {
      /* derived 再計算 */
    });
  }
}
```

#### 12.1.2 ビューごと

- presenter: `ThemeStore` の `resolved` を `<html data-theme>` に反映
- slideshow: `<html data-theme="dark">` 強制

#### 12.1.3 CSS 変数

```css
:root[data-theme='light'] {
  --color-bg: #ffffff;
  --color-fg: #1a1a1a;
  --color-muted: #6a6a6a;
  --color-border: #e0e0e0;
  --color-accent: #2563eb;
}

:root[data-theme='dark'] {
  --color-bg: #0a0a0a;
  --color-fg: #f0f0f0;
  --color-muted: #9a9a9a;
  --color-border: #2a2a2a;
  --color-accent: #60a5fa;
}

html {
  color-scheme: light dark;
  background: var(--color-bg);
  color: var(--color-fg);
}
```

#### 12.1.4 初期描画フラッシュ防止

`<head>` 内に inline script を埋め込み、スクリプト実行前に `localStorage` を読んで `data-theme` を当てる。slideshow view では常に `data-theme="dark"`。

#### 12.1.5 UI

```svelte
<fieldset role="radiogroup" aria-label={m.theme_label()}>
  <label><input type="radio" bind:group={themeStore.mode} value="system" /> {m.theme_system()}</label>
  <label><input type="radio" bind:group={themeStore.mode} value="light" /> {m.theme_light()}</label>
  <label><input type="radio" bind:group={themeStore.mode} value="dark" /> {m.theme_dark()}</label>
</fieldset>
```

### 12.2 i18n（Paraglide JS v2）

#### 12.2.1 パッケージと統合

- パッケージは **`@inlang/paraglide-js` v2**（Paraglide 2 の単一パッケージ。`paraglide-sveltekit` は v1 系の名残）
- Vite plugin `paraglideVitePlugin` で `vite.config.ts` に組み込み、ビルド時にメッセージ JSON から TypeScript 関数を生成
- 生成物は `src/lib/paraglide/` 配下、**gitignore する**（次の build で再生成されるため）
- **`strategy` オプションで locale 解決順を明示**: URL prefix なし、Accept-Language / navigator.languages 検出、ベースロケールフォールバック

```ts
// packages/client/vite.config.ts （抜粋）
import { paraglideVitePlugin } from '@inlang/paraglide-js';

plugins: [
  sveltekit(),
  paraglideVitePlugin({
    project: './project.inlang',
    outdir: './src/lib/paraglide',
    strategy: ['preferredLanguage', 'baseLocale'],
  }),
];
```

`strategy` の意味:

- **`preferredLanguage`** — サーバー側は `Accept-Language` ヘッダ、クライアント側は `navigator.languages` を見て解決
- **`baseLocale`** — どの strategy も決め手にならない場合のフォールバック（`en`）
- `url` は意図的に含めない → URL-prefix は発生しない
- `cookie` も含めない → 手動切替 UI なしの方針に整合（ユーザーの permission を求めない）

これにより自前の `detectLocale` 関数も、クライアント側の `setLocale()` 明示呼び出しも不要になる（Paraglide が両側で自動解決する）。

#### 12.2.2 設定ファイルとロケール

`packages/client/project.inlang/settings.json`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  },
  "baseLocale": "en",
  "locales": ["en", "ja"]
}
```

設定キー名の注意:

- v2 では **`baseLocale`** と **`locales`**（v1 の `sourceLanguageTag` / `languageTags` ではない）
- メッセージファイルは **`messages/{locale}.json`**（package root 直下）

#### 12.2.3 サーバー側 SSR フック

`packages/client/src/hooks.server.ts` で `paraglideMiddleware` を `handle` にかぶせ、リクエストごとに locale を確定し、`app.html` の `%paraglide.lang%` / `%paraglide.dir%` を実値に置換する:

```ts
// packages/client/src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';

export const handle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html
          .replace('%paraglide.lang%', locale)
          .replace('%paraglide.dir%', getTextDirection(locale)),
    });
  });
```

- `paraglideMiddleware` が strategy 順に locale を確定（preferredLanguage → baseLocale）
- 解決された `locale` は SSR 中も Paraglide ランタイムに反映され、メッセージが正しい言語で render される
- `getTextDirection(locale)` は `ltr` / `rtl` を返す（en・ja はともに `ltr`、将来の RTL 言語追加時に自動対応）

`hooks.ts`（universal reroute）は URL-prefix を使わないため **追加しない**。

#### 12.2.4 `app.html` の lang / dir 属性

```html
<!doctype html>
<html lang="%paraglide.lang%" dir="%paraglide.dir%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

SSR 時点で `<html lang="ja" dir="ltr">` などが正しく出力される。クライアント側で書き換える必要はない。

#### 12.2.5 呼び出し

```svelte
<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
</script>

<h1>{m.title_placeholder()}</h1>
<p>{m.next_slide_label({ n: 3 })}</p>
```

v2 では default export ではなく **`m` 名前付き export** からメッセージ関数を取り出す。SSR 時もクライアント時も、`m.*()` は Paraglide ランタイムの現在の locale で評価される。

#### 12.2.6 クライアント側の locale 解決

クライアントでは Paraglide ランタイムが `preferredLanguage` strategy 経由で `navigator.languages` を見て自動的に locale を解決する。手動 `setLocale()` 呼び出しは不要。

`src/lib/i18n/detect.ts` のような自前の検出関数は **削除**（Paraglide が同等の処理を内蔵）。`src/lib/i18n/` 自体が消えても良いが、将来の i18n 関連ユーティリティ用に空ディレクトリを残しても可。MVP では削除して、必要になったら再追加する方針。

### 12.3 メッセージ命名規則

- 全て snake_case
- カテゴリは prefix: `theme_*`、`error_*`、`info_*`、`label_*`
- パラメータは `{name}` 形式

## 13. エラー / 空状態の UI

### 13.1 状態モデル

```ts
export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface RenderState {
  status: SlidesStatus;
  pdfPageCount: number; // resolved 以外では 0
  noteGroupCount: number;
  effectivePageCount: number;
  hasOverflow: boolean;
}
```

### 13.2 presenter view での見せ方

| ステート                   | 中央エリア（outliner）      | 右ペイン（slide list）                                                     |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `resolved` + overflow なし | 通常                        | 通常（pdfPageCount 件）                                                    |
| `resolved` + overflow あり | 通常                        | スライドリスト末尾に overflow 項目を追加（pdfPageCount+1..noteGroupCount） |
| `configured-but-missing`   | 触らない（outliner 編集可） | スライドリスト領域内オーバーレイ。`error_slides_not_found`                 |
| `no-config-no-file`        | 触らない                    | スライドリスト内に小さなヒント `info_no_slides` のみ                       |
| `no-config-multiple-files` | 触らない                    | スライドリスト領域内オーバーレイ。`error_multiple_pdfs`                    |

オーバーレイは `aria-hidden="true"` + `inert` を背後の listbox に付ける。

### 13.3 slideshow view での見せ方

| ステート                        | 表示                                      |
| ------------------------------- | ----------------------------------------- |
| `resolved` + overflow なし      | 通常の画像                                |
| `resolved` + active が overflow | 中央プレースホルダー `Slide N (overflow)` |
| `configured-but-missing`        | 中央エラーメッセージ（黒背景、白文字）    |
| `no-config-no-file`             | 中央情報メッセージ                        |
| `no-config-multiple-files`      | 中央エラーメッセージ + ファイル名一覧     |

### 13.4 メタエンドポイント応答

```jsonc
// resolved
{ "status": "resolved", "hash": "...", "pageCount": 24 }

// errors (status: 422)
{ "status": "configured-but-missing", "configuredPath": "/abs/path/slides.pdf" }
{ "status": "no-config-no-file" }
{ "status": "no-config-multiple-files", "candidates": ["/abs/a.pdf", "/abs/b.pdf"] }
```

### 13.5 コンポーネント

```
packages/client/src/lib/slide-status/
├── SlideListErrorOverlay.svelte
├── SlideListHint.svelte
├── SlideshowFallback.svelte
├── slide-status-store.svelte.ts
└── __tests__/
```

### 13.6 動的再評価

Section 6.6 の file watchers と統合。MVP 範囲内で実装する。

ユーザー操作:

- PDF 追加 → `no-config-no-file` → `resolved`
- PDF 削除 → 残数次第で `no-config-no-file` または `resolved`
- 2 つ目を追加 → `resolved` → `no-config-multiple-files`
- config 編集 → 再評価
- 解決済み PDF の中身変更 → ハッシュ変更検出 + キャッシュ更新

### 13.7 アクセシビリティ

- エラー: `role="alert" aria-live="assertive"`
- 情報: `role="status" aria-live="polite"`
- オーバーレイの背後は `aria-hidden="true"` + `inert`

## 14. テスト戦略

### 14.1 テスト種別と環境

| 種別            | ランナー   | 環境                          | 配置                                 | ファイル名         |
| --------------- | ---------- | ----------------------------- | ------------------------------------ | ------------------ |
| Unit            | Vitest     | node                          | `__tests__/` co-located              | `*.test.ts`        |
| Integration     | Vitest     | node                          | `__tests__/` co-located              | `*.test.ts`        |
| Component       | Vitest     | browser (Playwright provider) | `__tests__/` co-located              | `*.svelte.test.ts` |
| E2E (cross-tab) | Playwright | browser                       | `src/routes/` co-located (`.e2e.ts`) | `*.e2e.ts`         |

サフィックスでランナー・環境が一意に決まる:

- `*.test.ts` → Vitest node
- `*.svelte.test.ts` → Vitest browser（component test）
- `*.e2e.ts` → Playwright

### 14.2 ディレクトリ構成

```
packages/client/
├── src/
│   ├── lib/
│   │   ├── outliner/
│   │   │   ├── ...
│   │   │   └── __tests__/
│   │   │       ├── separator.test.ts
│   │   │       ├── active-slide.test.ts
│   │   │       └── Outliner.svelte.test.ts
│   │   ├── slide-list/
│   │   │   └── __tests__/
│   │   │       └── SlideList.svelte.test.ts
│   │   ├── server/
│   │   │   ├── pdf-renderer.ts
│   │   │   ├── db-io.ts
│   │   │   └── __tests__/
│   │   │       ├── pdf-renderer.test.ts
│   │   │       ├── db-io.test.ts
│   │   │       └── fixtures/
│   │   │           └── sample.pdf
│   │   └── ...
│   └── routes/
│       ├── +page.svelte
│       ├── +page.svelte.e2e.ts          # presenter view 用 E2E
│       ├── presenter-flow.e2e.ts        # cross-tab E2E（route 横断、`.e2e.ts` suffix のみ）
│       ├── slideshow-sync.e2e.ts
│       ├── slide-rendering.e2e.ts
│       ├── slideshow/
│       │   ├── +page.svelte
│       │   └── +page.svelte.e2e.ts
│       └── ...
├── tests/
│   └── fixtures/                          # Playwright webServer の cwd ターゲット
│       ├── basic/                         # 単一 PDF プロジェクト
│       ├── configured/                    # config + PDF
│       ├── multiple-pdfs/                 # エラーケース
│       └── empty/                         # PDF なし
├── playwright.config.ts
└── vite.config.ts                         # Vite plugins + Vitest 設定（test:）
```

`packages/note-first-presenter/src/` 側も同じ規則（CLI のみで Playwright なし、`__tests__/` 配下に node テストのみ）。

### 14.3 Vitest 設定（Vite+ 流儀）

`vp test` は内部で Vitest を回し、設定は `vite.config.ts` の `test:` ブロックに書く（別途 `vitest.config.ts` は作らない）。`defineConfig` は `vite-plus` から import:

```ts
// packages/client/vite.config.ts
import { defineConfig } from 'vite-plus';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
    }),
  ],

  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', headless: true }],
          },
          include: ['src/**/*.svelte.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.svelte.test.ts'],
        },
      },
    ],
  },
});
```

ポイント:

- `vp test` は内部で `vite.config.ts` の `test:` ブロックを使う（`vitest.config.ts` を別に置かないのが Vite+ 流儀）
- `defineConfig` は **`vite-plus` から import**（`vitest/config` ではない）
- 2 つの project: `client`（browser）と `server`（node）
- `extends: true` で同じ config ファイルを継承
- browser provider は **`playwright()` from `@vitest/browser-playwright`**（古い文字列指定ではない）
- `expect: { requireAssertions: true }` で「assert なし test」を防ぐ
- include / exclude はディレクトリ名を使わず、ファイル名サフィックスのみで振り分け

### 14.4 Playwright 設定

```ts
// packages/client/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec note-first-presenter --port 5173',
    cwd: 'tests/fixtures/basic',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`testDir` を省略すると Playwright は config ファイルのディレクトリから testMatch で探索するため、`src/routes/` 配下の `*.e2e.ts` が自動で拾われる。

**`webServer.cwd` の役割**: CLI は `process.cwd()` を「利用者プロジェクトルート」として解釈する設計（Section 3.3）。Playwright がここを `tests/fixtures/basic/` に向けることで、「ユーザーがこの fixture プロジェクトで `note-first-presenter` を実行している状態」を再現できる。fixture には PDF と（必要なら）config がコミットされており、E2E は「PDF 読込済みの正常状態」から実行可能。

**シナリオ分岐の方針**: 複数 PDF / configured-but-missing 等の状態分岐は Vitest integration test で `+server.ts` を直接叩いて検証する。Playwright は happy path（basic fixture）の cross-tab 動作にフォーカスする。

### 14.5 テスト例

**Unit（node）:**

```ts
// src/lib/outliner/__tests__/active-slide.test.ts
test('caret in first group returns slide 1', () => {
  const doc = makeDoc([item('first'), item('second')]);
  const sel = textSelectionAt(doc, 2);
  expect(computeActiveSlide(doc, sel)).toBe(1);
});

test('caret on separator returns next slide', () => {
  const doc = makeDoc([item('a'), separator(), item('b')]);
  const sel = textSelectionInSeparator(doc);
  expect(computeActiveSlide(doc, sel)).toBe(2);
});
```

**Component（Vitest browser）:**

```ts
// src/lib/outliner/__tests__/Outliner.svelte.test.ts
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Outliner from '../Outliner.svelte';

describe('Outliner', () => {
  it('Tab indents the current bullet', async () => {
    render(Outliner, { doc: defaultDoc, onChange: () => {}, onActiveSlideChange: () => {} });
    const editor = page.getByRole('textbox');
    await editor.click();
    await page.keyboard.type('a\nb');
    await page.keyboard.press('Tab');
    // assert nested via DOM structure
  });
});
```

**E2E（Playwright cross-tab）:**

```ts
// src/routes/slideshow-sync.e2e.ts
import { test, expect } from '@playwright/test';

test('presenter advancing active slide updates slideshow tab', async ({ context }) => {
  const presenter = await context.newPage();
  await presenter.goto('/');

  const slideshow = await context.newPage();
  await slideshow.goto('/slideshow');

  await presenter.bringToFront();
  await presenter.getByRole('option', { name: /slide 3/i }).click();

  await expect(slideshow.locator('img')).toHaveAttribute('src', /\/3$/);
});
```

### 14.6 CI

ルート `package.json`:

```json
{
  "scripts": {
    "test": "vp run -r test && pnpm -F client test:e2e",
    "test:e2e": "playwright test"
  }
}
```

CI 手順:

1. `pnpm install`
2. `pnpm exec playwright install --with-deps chromium`
3. `vp run -r test`
4. `pnpm -F client test:e2e`

### 14.7 lint / format / typecheck

- `vp check` で oxlint / oxfmt / typescript チェック
- staged ファイルに対する自動修正は既存 `vite.config.ts` の `staged` 設定で実行

---
