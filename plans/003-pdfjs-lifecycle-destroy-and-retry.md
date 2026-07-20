# Plan 003: pdfjs ドキュメントをリロード時に destroy し、失敗したロードを再試行可能にする

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c4a6e81..HEAD -- packages/note-first-presenter/src/slides/pdf.ts packages/note-first-presenter/src/slides.ts packages/note-first-presenter/src/vite/plugin.ts packages/note-first-presenter/src/__tests__/slides.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c4a6e81`, 2026-07-19

## Why this matters

dev サーバは PDF や config が変わるたびに `Slides` インスタンスを捨てて作り直すが、旧インスタンスが抱える pdfjs の `PDFDocumentProxy`（ワーカー・ネイティブメモリ・バッファを所有）は一度も `destroy()` されない。PDF を再エクスポートしながらノートを書くのがこのツールの中核ワークフローなので、長い作業セッションでメモリが単調に増える。`Slides` インターフェースの `invalidate()` は定義されているが呼び出し箇所ゼロの死にコード。

また `getPdf = () => (pdfP ??= loadAndHash(...))` は **reject した promise もキャッシュし続ける**。書き込み途中の PDF を読んでロードが一度失敗すると、そのインスタンスへの `meta()`/`image()` は全部同じ rejection を返し続け、watcher の change イベントでインスタンスが差し替わるまでデッキが「恒久的に壊れた」ように見える（root watcher の `add` は `awaitWriteFinish` なしで発火するため、追加直後の半書きファイルで踏みやすい）。

## Current state

- `packages/note-first-presenter/src/slides/pdf.ts` — PDF 実装。`openPdfSlides` がクロージャで `pdfP: Promise<LoadedPdf> | null` を保持。
  - `pdf.ts:83-84`:
    ```ts
    let pdfP: Promise<LoadedPdf> | null = null;
    const getPdf = () => (pdfP ??= loadAndHash(slidesPath, cacheRoot));
    ```
  - `pdf.ts:143-145`（死にコード）:
    ```ts
    invalidate() {
      pdfP = null;
    },
    ```
  - `LoadedPdf` は `{ hash, pdf, pageCount }` で `pdf` が `PDFDocumentProxy`。`pdf.destroy()` は Promise を返す。
- `packages/note-first-presenter/src/slides.ts:51-57` — `Slides` インターフェース。`invalidate(): void;` を含む。
- `packages/note-first-presenter/src/vite/plugin.ts` — dev コンテキスト:
  - `plugin.ts:46-52` — インスタンスキャッシュ:
    ```ts
    let cached: { path: string; slides: Slides } | null = null;
    function getSlides(slidesPath: string): Slides {
      if (!cached || cached.path !== slidesPath) {
        cached = { path: slidesPath, slides: openSlides(slidesPath) };
      }
      return cached.slides;
    }
    ```
  - `plugin.ts:60-62`（`reload()` 内）— `cached = null;` で旧インスタンスを destroy せず破棄。
  - `plugin.ts:161-168` — コンテキストの `close()`。watcher は閉じるが Slides は閉じない。
  - `plugin.ts:314` — `server.httpServer?.on('close', () => void close())`。async の `close()` の rejection が unhandled になりうる（ついでに直す）。
- `packages/note-first-presenter/src/__tests__/slides.test.ts` — 実 PDF フィクスチャ `src/__tests__/fixtures/sample.pdf`（`SAMPLE_PDF` 定数）と `useTempCwd` を使う既存パターン。`invalidate` を使う既存テストはない（grep 済み）。

リポジトリ規約: 相対 import は拡張子必須（ADR-0010）。コメントは英語・少なめ。

## Commands you will need

| Purpose                        | Command                                     | Expected on success |
| ------------------------------ | ------------------------------------------- | ------------------- |
| Install                        | `vp install`                                | exit 0              |
| Format+lint+typecheck          | `vp check`                                  | exit 0              |
| CLI パッケージのユニットテスト | `vp run --filter note-first-presenter test` | all pass            |
| 全ユニットテスト               | `vp run test:unit`                          | all pass            |

**注意**: テストは `vp test` / `vp run` 経由で走らせること（vite-plus 0.2.x で素の `vitest` の破損は解消済みだが、リポジトリの標準経路は `vp`）。

## Scope

**In scope**:

- `packages/note-first-presenter/src/slides/pdf.ts`
- `packages/note-first-presenter/src/slides.ts`（`invalidate` のシグネチャ変更が必要な場合のみ）
- `packages/note-first-presenter/src/vite/plugin.ts`（`getSlides`・`reload`・`close`・`httpServer close` ハンドラのみ）
- `packages/note-first-presenter/src/__tests__/slides.test.ts`
- `packages/note-first-presenter/src/vite/__tests__/plugin.test.ts`（必要なら）

**Out of scope**:

- API ミドルウェア部（`createApiMiddleware`）— Plan 005 が扱う。触らない。
- `renderAll` の並行処理・キャッシュ設計 — 既に整備済み（commit 6d378f3）。
- pdfjs のバージョン変更や worker 設定。

## Git workflow

- Branch: `advisor/003-pdfjs-lifecycle`
- Commit style: conventional commit は使わない（例: `Destroy pdfjs documents on reload and retry failed loads`）
- push / PR 作成はオペレーターの指示がない限り行わない。

## Steps

### Step 1: `getPdf` の rejection キャッシュを解消する

`pdf.ts` の `getPdf` を、reject 時に自分をキャッシュから外す形にする:

```ts
let pdfP: Promise<LoadedPdf> | null = null;
const getPdf = () => {
  if (!pdfP) {
    const p = loadAndHash(slidesPath, cacheRoot);
    pdfP = p;
    // A rejected load must not be sticky: clear it so the next call retries.
    p.catch(() => {
      if (pdfP === p) pdfP = null;
    });
  }
  return pdfP;
};
```

**Verify**: `vp check` → exit 0

### Step 2: `invalidate()` に destroy を実装する

`pdf.ts` の `invalidate` を次にする（インターフェースの `invalidate(): void` は維持 — fire-and-forget で destroy する）:

```ts
invalidate() {
  const p = pdfP;
  pdfP = null;
  // Release pdfjs worker/native memory; ignore failures (already-broken loads).
  void p?.then((loaded) => loaded.pdf.destroy()).catch(() => {});
},
```

**Verify**: `vp check` → exit 0

### Step 3: `plugin.ts` から呼ぶ

3 箇所:

1. `getSlides`（`plugin.ts:47-52`）— キャッシュを差し替える前に旧インスタンスを invalidate:
   ```ts
   if (!cached || cached.path !== slidesPath) {
     cached?.slides.invalidate();
     cached = { path: slidesPath, slides: openSlides(slidesPath) };
   }
   ```
2. `reload()` 内（`plugin.ts:60-62` 付近）— `cached = null;` の前に `cached?.slides.invalidate();`。
3. コンテキストの `close()`（`plugin.ts:161-168`）— watcher close と併せて `cached?.slides.invalidate(); cached = null;`。

あわせて `plugin.ts:314` を rejection を握る形にする:

```ts
server.httpServer?.on('close', () => {
  close().catch((err) => server.config.logger.error(String(err)));
});
```

**Verify**: `vp check` → exit 0

### Step 4: テストを追加する

`slides.test.ts` に追加（`SAMPLE_PDF` + `useTempCwd` の既存パターン）:

1. **失敗ロードが再試行される**: 一時 cwd に壊れた PDF（`await fs.writeFile('broken.pdf', 'not a pdf')`）を置き `openSlides(path.resolve('broken.pdf'))` の `meta()` が reject することを確認 → その後 `fs.copyFile(SAMPLE_PDF, 'broken.pdf')` で有効な PDF に置き換え → **同じインスタンス**の `meta()` が resolve すること（現状の実装ではここが失敗し続ける — このテストが本プランの回帰ガード）。
2. **invalidate 後の再読込**: `meta()` → `invalidate()` → PDF を別内容の有効 PDF に置き換え（sample.pdf をコピーして 1 バイト追記では PDF が壊れるので、`meta()` の hash が変わることの検証は「同一ファイルを touch しても hash 不変」→「invalidate 後に再ロードされる」ことを `hash` の同一性と `pdfP` 再生成で見る。シンプルには: `invalidate()` 後の `meta()` が resolve し、結果が初回と等しいこと = destroy 済みドキュメントに触れていないこと）。

`plugin.test.ts` の `createSlidesContext` テスト群が既に通ることを確認（`getSlides caches Slides instances per path` は invalidate 追加後も成立するはず — 同一パスでは差し替えないため）。

**Verify**: `vp run --filter note-first-presenter test` → all pass、新規テストを含む

### Step 5: 全体検証

**Verify**: `vp check && vp run test:unit` → ともに exit 0

## Test plan

- 上記 Step 4 の 2 テスト。実ファイル・実 pdfjs を使い、モックしない（既存 `slides.test.ts` の流儀）。
- destroy が実際に呼ばれたことの直接検証（スパイ）はしない — pdfjs 内部への依存になるため。「invalidate 後も新しいロードで正常動作する」「rejection が sticky でない」という観測可能な挙動で担保する。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `vp check` exits 0
- [ ] `vp run --filter note-first-presenter test` exits 0、失敗ロード再試行のテストが存在して通る
- [ ] `grep -n "destroy" packages/note-first-presenter/src/slides/pdf.ts` がマッチする
- [ ] `grep -rn "invalidate()" packages/note-first-presenter/src/vite/plugin.ts` が 3 箇所（getSlides / reload / close）でマッチする
- [ ] `git status` で in-scope 以外の変更ファイルがない
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

Stop and report back (do not improvise) if:

- 引用箇所の現状コードが抜粋と一致しない。
- `pdf.destroy()` の呼び出しで pdfjs-dist（legacy build）が例外や警告ループを起こす場合 — バージョン固有の問題なので報告。
- `plugin.test.ts` の既存テストが invalidate 追加で落ち、原因が「同一パスの再取得でインスタンスが破棄される」だった場合 — Step 3-1 の条件分岐が間違っているので、修正 2 回で直らなければ報告。

## Maintenance notes

- 将来 `Slides` の実装を増やす場合（画像ディレクトリソース等）、`invalidate()` が「保持リソースの解放 + 次回アクセスでの再ロード」という契約であることを守ること。
- レビュー観点: `p.catch(() => { if (pdfP === p) pdfP = null; })` の同一性チェック（新しいロードが始まった後に古い rejection がキャッシュを消さないため）。
- 意図的に見送ったもの: `close(): Promise<void>` へのインターフェース変更（await したい呼び出し元が現状ない）、renderAll 中の invalidate 競合対策（one-shot コマンドでしか renderAll は使われない）。
