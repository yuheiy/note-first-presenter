# Tailwind を color-scheme + light-dark() ベースのテーマに統合する

Tailwind v4 を導入し、テーマ切替を `[data-theme]` 属性から **`color-scheme` + `light-dark()`**
へ再設計する。配色は単一の `@theme` ブロックで `light-dark()` トークンとして定義し、切替は
Tailwind の `scheme-*` ユーティリティを `<html>` に当てて行う。`dark:` バリアントは使わない。

## 動機

`color-scheme` + `light-dark()` にすると system 追従・OS 変更追従を CSS が担うため、旧
`theme-store` の `matchMedia` 購読・`resolved` 算出が不要になり、ネイティブ UI（スクロールバー
等）も自動でテーマに揃う。

## 設計決定

### 切替は `scheme-*` ユーティリティ、配色は `light-dark()` トークン

`theme-store` は `<html>` の `scheme-*` クラス（`scheme-light`/`scheme-dark`/`scheme-light-dark`）
を `mode` に応じて差し替えるだけ（`scheme-light-dark` が system=OS 追従）。FOUC 対策に `app.html`
の `<html>` へ既定 `scheme-light-dark` を付け、インラインスクリプトが localStorage の選択を初回
描画前に反映する。`dark:` を使わないのは、`color-scheme` が dark の状態を狙う CSS セレクタが無く、
`dark:`（既定で OS の `prefers-color-scheme`）をユーザのピン留め選択に追従させられないため。

### Tailwind は `light-dark()` をダウンレベルする — `scheme-*` 経由なら追従する（肝）

`@tailwindcss/vite` は全 `.css` を自前 lightningcss（Safari 16.4 固定）に通し、`light-dark()` を
`--lightningcss-light/dark` を使う `prefers-color-scheme` ポリフィルへ**ダウンレベルする**
（`optimize:false` や Vite 側 targets では止まらない）。このポリフィルは `color-scheme` が
**静的セレクタ**で宣言された箇所にトグル変数を co-emit するため、`.scheme-*{color-scheme:…}`
経由なら切替が効く（`scheme-light-dark` は `@media (prefers-color-scheme)` 版が付き OS 追従）。
逆に **JS のランタイム `style.colorScheme` には追従しない**ので、切替はクラスで行う。`color-scheme`
を `:root` に置かないのは `.scheme-*` と特異度衝突させないため。

### 公開 CLI 向けに `source('..')` で検出ベースを固定する

Tailwind v4 の自動コンテンツ検出は node_modules 配下を除外する。公開 CLI は Vite の root を
`node_modules/@note-first-presenter/client` に向けるため、`layout.css` で
`@import 'tailwindcss' source('..')` と検出ベースを `src/` に明示固定しないと、スキャンゼロで UI が
無スタイル化する。リポジトリ内は client がワークスペース symlink（node_modules 外）のため隠れる、
典型的な CLI パッケージングの盲点（CLAUDE.md 参照）。`@source` グロブでも可だが `.gitignore` を
無視して生成物まで走査するため `source('..')` を選ぶ。

### 単一 `@theme` ブロック（別名ブリッジしない）

`@theme { --color-bg/fg/muted/border/accent: light-dark(...) }` の1ブロックのみ。Tailwind は全
変数を `:root` に出力するので、ユーティリティ（`bg-bg`/`text-fg`/`text-muted` 等）も Outliner 等
スコープ CSS の生 `var(--color-*)` も同じ値で解決できる。使うユーティリティ名はトークン名と一致
するため `@theme inline` での別名（`bg-background` 等）ブリッジは不要。

### ProseMirror: 外側の単一要素のみ Tailwind

エディタルート（`EditorView.attributes.class`）のみユーティリティ化し、内部で反復生成される要素・
疑似要素・`:has`・`attr()` は通常 CSS のまま（`var(--color-*)` 経由でトークンと一致）。

## Considered Options

- **`[data-theme]` 維持 + `dark:` を `[data-theme]` にリバインド**: 却下。`light-dark()` の
  ネイティブ UI 一括追従を捨て、別系統の保守が増える。
- **`style.colorScheme` を JS で設定 + `light-dark()` を `app.html` に退避して native 保持**:
  却下。ポリフィルがランタイム `color-scheme` に追従せず、トークンを CSS パイプライン外へ逃がす
  必要があり不自然。`scheme-*` クラスなら co-emit で機能し、トークンを `layout.css` に置ける。

## Consequences

- `theme-store` は `mode` + `applyToDocument`（`scheme-*` クラス差し替え）のみ
  （`systemPrefersDark`/`resolved`/`listenSystem` は削除）。3状態 UI は維持。
- `scheme-*` クラスは JS 付与なので、Tailwind の content スキャンに拾われるよう `theme-store` と
  `app.html` にリテラルで出現させる必要がある。
- `dark:` 廃止やテーマ方式の差し戻しは、ユーティリティを使う全コンポーネントに波及する。
