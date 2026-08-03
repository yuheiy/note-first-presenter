# Tailwind を color-scheme ベースのテーマに統合する

Tailwind v4 を導入し、テーマ切替は **`color-scheme`** で行う。切替は Tailwind の `scheme-*` ユーティリティ（`scheme-light` / `scheme-dark` / `scheme-light-dark`）を `<html>` に当てるだけで、`scheme-light-dark` が system=OS 追従。`dark:` バリアントは使わない — `color-scheme` が dark の状態を狙う CSS セレクタが無く、`dark:`（既定で OS の `prefers-color-scheme`）をユーザのピン留め選択に追従させられないため。

- system 追従・OS 変更追従を CSS が担うため、`matchMedia` 購読や `resolved` 算出の JS が不要になり、ネイティブ UI（スクロールバー等）も自動でテーマに揃う。
- FOUC 対策: `index.html` の `<html>` に既定 `scheme-light-dark` を付け、インラインスクリプトが localStorage の選択を初回描画前に反映する。
- `scheme-*` クラスは JS 付与なので、Tailwind の content スキャンに拾われるよう `theme.ts` と `index.html` にリテラルで出現させる必要がある。
- 配色は当初 `light-dark()` の意味論トークン（`--color-bg` 等）だったが、**直接の Tailwind クラス参照に移行して廃止した**（時期尚早な抽象だった）。再導入する場合の罠を1つだけ記録しておく: `@tailwindcss/vite` は全 `.css` を自前 lightningcss（Safari 16.4 固定）に通し、`light-dark()` を `prefers-color-scheme` ポリフィルへ**ダウンレベルする**。そのポリフィルは `color-scheme` が**静的セレクタ**で宣言された箇所にしか追従せず、JS のランタイム `style.colorScheme` には追従しない — 切替をクラスで行うのはこのため。

## 公開 CLI 向けに `source()` で検出ベースを固定する

Tailwind v4 の自動コンテンツ検出は node_modules 配下を除外する。公開 CLI は Vite の root を `node_modules/@note-first-presenter/client` に向けるため、`src/style.css` で `@import 'tailwindcss' source(…)` と検出ベースを明示固定しないと、スキャンゼロで UI が無スタイル化する。リポジトリ内は client がワークスペース symlink（node_modules 外）のため隠れる、典型的な CLI パッケージングの盲点。`@source` グロブは `.gitignore` を無視して生成物まで走査するため退けた（詳細は `style.css` のコメントが正本）。

## ProseMirror: 外側の単一要素のみ Tailwind

エディタルート（`EditorView.attributes.class`）のみユーティリティ化し、内部で反復生成される要素・疑似要素・`:has` は通常 CSS（`outliner.css`）のまま。
