# note-first-presenter

Workflowy 風アウトライナーに書いたノートに沿って、PDF を素材に手元のプレゼンを進行できる開発サーバー型のツール。プロジェクト直下に PDF を置いて `note-first-presenter` を起動すると、SvelteKit dev サーバーが立ち上がり、ノートを書きながらスライド一覧と発表者ビューが連動して動きます。

設計は [`docs/superpowers/specs/2026-05-26-note-first-presenter-design.md`](./docs/superpowers/specs/2026-05-26-note-first-presenter-design.md)、実装計画は [`docs/superpowers/plans/2026-05-26-note-first-presenter-mvp.md`](./docs/superpowers/plans/2026-05-26-note-first-presenter-mvp.md) を参照。

## クイックスタート

```bash
pnpm install
pnpm dev
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

出力先: `<export.outDir>/<PDF ファイル名>.<extension>`（例: `export/slides.md`）。デフォルト値は `export.outDir = export`、`export.imageDir = images`（outDir からの相対）。`export.format.template` と `export.format.extension` は必須です。

```ts
// note-first-presenter.config.ts
export default {
  slides: 'slides.pdf',
  export: {
    outDir: 'export',
    imageDir: 'images',
    format: { template: 'template.eta', extension: 'md' },
  },
};
```

```bash
note-first-presenter export
note-first-presenter export --out-dir out --image-dir imgs --template custom.eta
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
| `image`            | `string \| null` | スライド画像への相対パス（例: `images/0001.webp`）。PDF ページを持たないダミースライドは `null`                                    |
| `width` / `height` | `number`         | 画像のピクセルサイズ（ダミースライドは `0`）                                                                                       |
| `notes`            | 配列             | このスライドのノートツリー（`{ text, children }` ノードの配列）。アウトライン内のトップレベル `---` セパレータでスライドごとに分割 |

テンプレート例:

```eta
# <%= it.title %>

<% it.slides.forEach(function (slide) { %>
## Slide <%= slide.number %>
<% if (slide.image) { %>![](<%= slide.image %>)<% } %>

<%= it.toMarkdown(slide.notes) %>
<% }) %>
```

## アーキテクチャ

```
packages/
├── note-first-presenter/   # CLI + Vite plugin (programmatic dev server)
└── client/                 # SvelteKit app (presenter + slideshow + outliner)
```

- `note-first-presenter` (CLI): 利用者プロジェクトの cwd で起動し、`@note-first-presenter/client` の SvelteKit dev サーバーを programmatic に起動。`virtual:nfp/runtime-config` でランタイム設定を client に流し込む。
- `client` (SvelteKit): ProseMirror ベースの outliner、ARIA listbox のスライド一覧、`pdfjs-dist` + `@napi-rs/canvas` で WebP にレンダリングしたスライド画像をディスクキャッシュ越しに配信。

## 開発

```bash
# 型・lint・format をまとめてチェック
vp check

# 全パッケージのユニットテスト (Vitest)
vp run -r test

# E2E (Playwright)
pnpm test:e2e

# ready: check + test + e2e
pnpm ready
```

技術スタック: TypeScript、SvelteKit、Svelte 5 runes、Vite+、ProseMirror、pdfjs-dist、@napi-rs/canvas、chokidar、ofetch、valibot、@inlang/paraglide-js (en/ja)、Vitest、Playwright。
