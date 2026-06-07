Status: needs-triage

# Adopt Tailwind CSS

## Context

SvelteKit 移行時に Tailwind CSS の導入を検討したが、移行と同時に行うとスコープが広がりすぎるため後回しにする。

## Approach

- `@tailwindcss/vite` プラグインを追加
- `src/routes/layout.css` で `@import 'tailwindcss'` を読み込む
- `+layout.svelte` から `import './layout.css'` する
- 既存の `<style>` ブロック内のスタイルを段階的に Tailwind ユーティリティに置き換える

## Notes

- my-app の構成（`@tailwindcss/vite` + `layout.css`）に合わせる
- Tailwind CSS v4 を使用する（`@import 'tailwindcss'` 形式）
