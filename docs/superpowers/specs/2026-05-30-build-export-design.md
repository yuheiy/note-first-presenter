# note-first-presenter `build` / `export` 設計ドキュメント

- 作成日: 2026-05-30
- 対象: post-MVP（`build` / `export` サブコマンド）
- ステータス: 設計確定
- 前提設計: `docs/superpowers/specs/2026-05-26-note-first-presenter-design.md`（§1.4 で名前と config スキーマのみ定義済み）

## 1. 目的とスコープ

MVP では名前と valibot スキーマだけ用意されていた 2 つの CLI サブコマンドを実装する。

- **`note-first-presenter build`** — presenter / slideshow の両ビューを閲覧できる**読み取り専用の静的サイト**を生成する。編集・保存はできないが、両ビューを静的ホスティング（GitHub Pages 等）に置いて共有・再生できる。
- **`note-first-presenter export`** — eta テンプレートを通して、デッキ全体を**1 つの任意フォーマットファイル**（Markdown 台本 / HTML 配布資料など）に出力する。スライド画像は別ディレクトリへ書き出してテンプレートから相対参照する。

両コマンドは 1 つの spec / plan / 実装サイクルで扱う。

### 1.1 含まないもの（YAGNI）

- スライドごとに 1 ファイルを出すモード（export はデッキ全体で 1 ファイルのみ）
- 編集可能アプリのサーバーデプロイ向け production ビルド（build は静的・読み取り専用のみ）
- 独立した静的ビューワの新規実装（既存 SvelteKit アプリを再利用する）
- PPTX 入力（既存どおり PDF のみ）
- watch 付き build / インクリメンタル再生成

## 2. CLI サーフェス

`packages/note-first-presenter/src/cli.ts` の citty `mainCommand` に `subCommands` を追加する。引数なし起動（`mainCommand` の `run`）は従来どおり dev サーバーで、挙動は変更しない。

```
note-first-presenter            # 既存: dev サーバー（変更なし）
note-first-presenter build      # 静的サイト生成
note-first-presenter export     # eta テンプレートでエクスポート
```

- `build` フラグ: `--out-dir <dir>`（config の `build.outDir` を上書き）
- `export` フラグ: `--out-dir <dir>` / `--image-dir <dir>` / `--template <file>`（各 config 値を上書き）

サブコマンドの `run` は、共通の前処理（config 解決・PDF パス解決）を CLI 側で行ってから、それぞれの実装関数（`runBuild` / `runExport`）へ委譲する。

## 3. 共通ヘッドレス・パイプライン

`build` / `export` のどちらも「config を解決し、PDF を全ページ描画し、DB を読み、outline をスライド単位のノートグループに割る」処理を要する。これらの素材ロジックは prosemirror schema・区切り判定・PDF レンダラを既に持つ **`@note-first-presenter/client` パッケージ内**に置き、CLI（`note-first-presenter` パッケージ）から import する。

### 3.1 処理ステップ

1. **config / PDF パス解決** — CLI 側で既存の `loadNfpConfig(cwd)` / `resolveSlidesPath(...)` を実行し、結果をヘッドレス関数に渡す。
2. **PDF 全ページ描画** — 既存 `packages/client/src/lib/server/pdf-renderer.ts` を流用し、全ページを webp としてレンダリングする。キャッシュ機構（`slide-cache.ts`）はそのまま利用してよい。
3. **DB 読込** — 既存 `packages/client/src/lib/server/db-io.ts` の `readDb` を流用。DB 不在時は空アウトライン（`defaultDb()`）。
4. **ノートグループ分割** — outline（ProseMirror doc JSON）のトップレベル `list_item` を、単独 `---` paragraph（`count-groups.ts` の `isSeparatorItem` と同じ判定）を境界としてスライド単位のグループに割る。区切り項目自体はグループ境界として消費し、ノードには含めない。
5. **ノートツリー化** — 各グループの `list_item` 列を `NoteNode[]` に変換する。

```ts
interface NoteNode {
  text: string; // list_item 直下 paragraph の textContent
  children: NoteNode[]; // ネストした bullet_list の list_item 群
}
```

`list_item` の `collapsed` 属性は export / build いずれでも無視する（常に全展開）。

### 3.2 スライドとノートの対応

dev と同じく index ベースで対応させる。エントリ数 = `max(スライド数, ノートグループ数)`。

- 実スライドが存在する index はその webp を画像とし、超過 index（ノートグループのみ）はダミー（画像 `null`）。
- ノートグループが存在する index はそのツリー、超過 index（スライドのみ）は空 `[]`。

これは MVP 設計 §1.3「ノートグループ数 > スライド数の場合は超過分にダミースライド」と整合する。

## 4. `export`（純 Node 実装、SvelteKit ビルド不要）

eta テンプレートを実行してデッキ全体を 1 ファイルへ書き出す、純粋な Node パイプライン。

### 4.1 出力物

- **画像**: 実スライド画像のみを `export.imageDir` に webp で書き出す。ファイル名は 1 オリジン 4 桁ゼロ詰め（`0001.webp`, `0002.webp`, …）。ダミースライド（画像なしエントリ）は書き出さない。
- **本体ファイル**: `export.outDir/<name>.<extension>` を 1 つ生成する。`<name>` はスライド PDF のベース名（拡張子を除いたもの）、解決できない場合は `notes`。`<extension>` は `export.format.extension`。

### 4.2 テンプレート context

eta テンプレートには次の context を渡す。整形ヘルパーは関数として同梱し、テンプレート作者が出力形式に応じて選べるようにする。

```ts
interface ExportContext {
  title: string;
  slideCount: number;
  slides: Array<{
    number: number; // 1 オリジン
    image: string | null; // 出力本体ファイルから見た相対パス（例 "images/0001.webp"）、ダミーは null
    width: number;
    height: number;
    notes: NoteNode[];
  }>;
  // 整形ヘルパー（NoteNode[] を受け取り文字列を返す）
  toMarkdown(notes: NoteNode[]): string; // "- " ネスト箇条書き Markdown
  toHtml(notes: NoteNode[]): string; // <ul><li>…</li></ul>
}
```

`image` のパスは `export.outDir` と `export.imageDir` の関係から相対計算する（本体ファイルの位置を基準）。

### 4.3 ヘルパー仕様

2 ヘルパーはいずれも `NoteNode[]` を受けてネスト構造を保ったまま整形する。

- `toMarkdown`: 各ノードを `- <text>`、子は 2 スペースインデントで入れ子。
- `toHtml`: `<ul>` でラップし各ノードを `<li>`、子があれば `<li>` 内に再帰的な `<ul>`。`text` は HTML エスケープする。

### 4.4 エラー

- `export.format`（`template` と `extension`）が未設定の場合、明確なエラーメッセージで終了する（例: `export requires "format.template" and "format.extension" in config`）。
- テンプレートファイルが存在しない場合もエラー終了。

### 4.5 依存追加

- `eta`（`@note-first-presenter/client` パッケージ、cli 経由で追加）。

## 5. `build`（既存アプリを adapter-static で静的化）

既存の SvelteKit アプリ（presenter / slideshow）をそのまま再利用し、`@sveltejs/adapter-static` + prerender で読み取り専用の静的サイトを生成する。

### 5.1 build モードのフラグ伝播

`packages/note-first-presenter/src/plugin/virtual-modules.ts` の runtime-config に `mode: 'dev' | 'build'` を追加する。クライアントは `virtual:nfp/runtime-config` 経由でモードを読む。

### 5.2 build モードのクライアント挙動

- outliner は `editable=false`（編集不可）。
- タイトル編集不可。
- DB の PUT を一切呼ばない（保存系コードを build モードで無効化）。
- `api/db` / `api/slides/meta` / `api/slide/[hash]/[n]` の **GET を prerender** し静的ファイル化する。slide エンドポイントは `entries()` を「active hash × ページ数」で列挙する。URL は dev と同一のため、クライアントの fetch コードは無改修。
- `api/db` の PUT は build モードでは prerender を阻害しないようガード/除外する。

### 5.3 ビルド起動

- `svelte.config.js` は環境フラグ（例: `NFP_BUILD`）で `@sveltejs/adapter-auto`（dev/通常）と `@sveltejs/adapter-static`（build: prerender 有効・fallback 無効）を切り替える。adapter-static の出力先を `build.outDir`（default `dist`）に向ける。
- CLI `build` コマンドは `startServer` と同様に clientRoot へ `process.chdir` し、vite-plus の `build()` を nfp plugin（build モード）付きで起動する。出力先 `build.outDir` は cwd 基準で解決する。

### 5.4 依存追加

- `@sveltejs/adapter-static`（`@note-first-presenter/client` パッケージ、cli 経由で追加）。

## 6. config デフォルト

`packages/note-first-presenter/src/config/schema.ts` のスキーマは変更しない（既に `build.outDir` / `export.outDir` / `export.imageDir` / `export.format` を定義済み）。各コマンドが未設定時に適用するデフォルト:

| 項目              | デフォルト                 | 基準                 |
| ----------------- | -------------------------- | -------------------- |
| `build.outDir`    | `dist`                     | cwd                  |
| `export.outDir`   | `export`                   | cwd                  |
| `export.imageDir` | `images`                   | `export.outDir` 相対 |
| `export.format`   | （なし。未設定ならエラー） | —                    |

すべて cwd（プロジェクトルート）基準で絶対パスに解決する。

## 7. テスト

- **unit**:
  - outline → `NoteNode[]` グループ化（区切り分割・ネスト・空 outline）
  - `toMarkdown` / `toHtml` の整形（ネスト・HTML エスケープ）
  - export context ビルダー（画像相対パス・ダミースライド・count = max ロジック）
  - config デフォルト解決（CLI フラグ上書きを含む）
- **integration**:
  - fixture（`sample.pdf` + DB）で `export` が本体 1 ファイル + 画像群を生成し、内容が期待どおり
  - `build` が静的 dir に prerender 済みスライド画像・読み取り専用ページ・静的 `api/db` を生成
- **e2e（最小）**:
  - 生成した build 成果物を静的配信し、slideshow が矢印キーでナビゲートできる

## 8. 影響ファイル（想定）

- `packages/note-first-presenter/src/cli.ts` — subCommands 追加
- `packages/note-first-presenter/src/build.ts`（新規） — `runBuild`
- `packages/note-first-presenter/src/export.ts`（新規） — `runExport`
- `packages/note-first-presenter/src/config/*` — デフォルト解決ヘルパー追加
- `packages/note-first-presenter/src/plugin/virtual-modules.ts` — `mode` 追加
- `packages/note-first-presenter/src/index.ts` — 公開 API 追加
- `packages/client/src/lib/export/*`（新規） — ヘッドレス・パイプライン（ノートツリー化・ヘルパー・context・eta 実行）
- `packages/client/src/routes/**` — build モードの読み取り専用化・prerender 設定
- `packages/client/svelte.config.js` — adapter 切替
- `packages/client/package.json` — `eta` / `@sveltejs/adapter-static` 追加（cli 経由）
