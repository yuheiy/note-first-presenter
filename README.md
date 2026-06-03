# note-first-presenter

Workflowy 風アウトライナーに書いたノートに沿って、PDF を素材に手元のプレゼンを進行できる開発サーバー型のツール。プロジェクト直下に PDF を置いて `note-first-presenter` を起動すると、CLI が dev サーバーを立ち上げ、ノートを書きながらスライド一覧と発表者ビューが連動して動きます。

ドメイン語彙は [`CONTEXT.md`](./CONTEXT.md)、主要な設計判断の経緯は [`docs/adr/`](./docs/adr/) を参照。

## クイックスタート

```bash
vp install
vp dev
```

プロジェクト直下の PDF (`*.pdf`) を自動検出してスライドの素材として使用します。配置を明示したい場合は `note-first-presenter.config.ts` で:

```ts
import { defineConfig } from 'note-first-presenter';

export default defineConfig({
  slides: './docs/main.pdf',
});
```

起動後:

- **発表者ビュー** `http://localhost:5173/` — ノートを書き、スライド一覧を確認
- **スライドショー** `http://localhost:5173/slideshow` — 別ウィンドウ／別画面で開き、BroadcastChannel 経由で発表者ビューと同期

## CLI サブコマンド

### `note-first-presenter build`

発表者ビューとスライドショービューを含む静的サイトを出力ディレクトリに生成します。ビルド済みサイトでは編集・保存が無効化され、スライド画像とノートは `nfp-data/` 以下に静的ファイルとして埋め込まれます。

出力先のデフォルトは `dist`。設定ファイルの `build.outDir` または `--out-dir <dir>` フラグで変更できます（フラグが優先）。

```ts
// note-first-presenter.config.ts
export default {
  slides: 'slides.pdf',
  build: { outDir: 'dist' },
};
```

```bash
note-first-presenter build
note-first-presenter build --out-dir public
```

### `note-first-presenter export`

Eta テンプレートを使ってデッキ全体を単一ファイルにレンダリングします。スライド画像は画像ディレクトリに書き出され、テンプレート出力から相対パスで参照されます。

出力先: `<export.outDir>/<filename>`（例: `export/index.html`）。デフォルト値は `export.outDir = export`、`export.assetsDir = assets`（outDir からの相対）。

`export.filename` / `export.template` は省略可能です。省略時は `filename = 'index.html'`、`template` は組み込みの HTML テンプレートが使われます（設定なしでも `note-first-presenter export` が動作します）。独自フォーマットを出力する場合は `export.template` に Eta テンプレート文字列を直接指定し、必要に応じて `export.filename` に拡張子込みの出力ファイル名を指定します。

```ts
// note-first-presenter.config.ts
export default {
  slides: 'slides.pdf',
  export: {
    outDir: 'export',
    assetsDir: 'assets',
    filename: 'index.md',
    template: `# <%= it.title %>

<% it.slides.forEach(function (slide) { %>
## Slide <%= slide.number %>
<% if (slide.image) { %>![](<%= slide.image %>)<% } %>

<%~ it.toMarkdown(slide.notes) %>
<% }) %>`,
  },
};
```

```bash
note-first-presenter export
note-first-presenter export --out-dir out --assets-dir imgs
```

テンプレートは `it` オブジェクトで以下のコンテキストを受け取ります:

| プロパティ             | 型       | 説明                                                                                  |
| ---------------------- | -------- | ------------------------------------------------------------------------------------- |
| `it.title`             | `string` | デッキタイトル                                                                        |
| `it.slideCount`        | `number` | スライド総数（PDF ページ数とノートグループ数の最大値）                                |
| `it.slides`            | 配列     | 各スライドの情報（後述）                                                              |
| `it.toMarkdown(notes)` | 関数     | `notes` 配列をネストした Markdown 箇条書きとして返す                                  |
| `it.toHtml(notes)`     | 関数     | `notes` 配列をネストした `<ul><li>` HTML として返す（テキストは HTML エスケープ済み） |

`it.slides` の各要素:

| プロパティ         | 型               | 説明                                                                                                                               |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `number`           | `number`         | 1 始まりのスライド番号                                                                                                             |
| `image`            | `string \| null` | スライド画像への相対パス（例: `assets/0001.webp`）。PDF ページを持たないダミースライドは `null`                                    |
| `width` / `height` | `number`         | 画像のピクセルサイズ（ダミースライドは `0`）                                                                                       |
| `notes`            | 配列             | このスライドのノートツリー（`{ text, children }` ノードの配列）。アウトライン内のトップレベル `---` セパレータでスライドごとに分割 |

テンプレート例:

```eta
# <%= it.title %>

<% it.slides.forEach(function (slide) { %>
## Slide <%= slide.number %>
<% if (slide.image) { %>![](<%= slide.image %>)<% } %>

<%~ it.toMarkdown(slide.notes) %>
<% }) %>
```

> **Eta のエスケープ動作について**: Eta は既定の `autoEscape`（有効）で動作します。`<%= ... %>` は HTML エスケープされ（HTML 出力で安全）、`<%~ ... %>` はエスケープせずそのまま出力します。ノートツリーは `<%~ it.toHtml(slide.notes) %>` で出力してください（`toHtml` はテキストを既にエスケープ済みです）。Markdown 出力では `<%~ it.toMarkdown(slide.notes) %>` のように `<%~` を使い、箇条書きが HTML エスケープされないようにします。

## アーキテクチャ

```
packages/
├── note-first-presenter/   # CLI: Node / サーバ / Vite / API ミドルウェアを全所有
└── client/                 # 純 Svelte SPA (presenter + slideshow + outliner)
```

依存は `cli → client` の一方向のみ。詳細な設計判断は [`docs/adr/`](./docs/adr/) を参照。

- `note-first-presenter` (CLI): 利用者プロジェクトの cwd で起動し、Vite dev サーバーと API ミドルウェアを programmatic に立ち上げる。config・slides 解決・DB I/O・`pdfjs-dist` + `@napi-rs/canvas` での WebP レンダリング（ディスクキャッシュ）といったサーバ責務をすべて担う。
- `client` (純 Svelte SPA): ProseMirror ベースの outliner、ARIA listbox のスライド一覧、発表者／スライドショービュー。サーバとは API 越しに JSON を fetch するだけで、上流に依存しない。

## 開発

```bash
# 型・lint・format をまとめてチェック
vp check

# 全パッケージのユニットテスト (Vitest)
vp run -r test

# E2E (Playwright)
vp run test:e2e

# ready: check + test + e2e
vp run ready
```

技術スタック: TypeScript、Svelte 5 runes、Vite+、ProseMirror、pdfjs-dist、@napi-rs/canvas、chokidar、ofetch、valibot、@inlang/paraglide-js (en/ja)、Vitest、Playwright。
