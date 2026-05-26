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
