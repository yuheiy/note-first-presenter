# Plan 005: スライド画像エンドポイントの middleware 分岐をテストで固める

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c4a6e81..HEAD -- packages/note-first-presenter/src/vite/plugin.ts packages/note-first-presenter/src/vite/__tests__/plugin.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
> なお Plan 003 が先に実施済みの場合、`plugin.ts` に `invalidate()` 呼び出しが追加されているのは想定内のドリフトであり、STOP 不要（ミドルウェア部 `createApiMiddleware` が抜粋と一致していれば続行してよい）。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（003 と順不同で実施可）
- **Category**: tests
- **Planned at**: commit `c4a6e81`, 2026-07-19

## Why this matters

`/api/slide/{hash}/{n}` はクライアントが表示するすべてのスライド画像を配る主要エンドポイントだが、ミドルウェア層のテストは「slides が未解決のとき」しかカバーしていない（既存テストは `getSlides` に throw するスタブを渡している）。つまり URL 正規表現のパース、hash 照合（キャッシュバスティングの要）、`content-type`/`cache-control`/`etag` ヘッダ、`PageOutOfRangeError`→404、不正ページ→400 という本命の分岐がすべて無検証で、退行しても CI（ローカルの `vp test`）を素通りする。既存のテストハーネスがそのまま使えるので、追加コストは小さい。

## Current state

- `packages/note-first-presenter/src/vite/plugin.ts:171` — ルート正規表現:
  ```ts
  const SLIDE_RE = /^\/api\/slide\/([^/]+)\/(\d+)$/;
  ```
- `plugin.ts:246-282` — 対象の分岐（`createApiMiddleware` 内 `default` ケース）:
  - slides 未解決 → `404 { error: 'slides not available' }`
  - `n` が正整数でない → `400 { error: 'invalid page' }`
  - `requestedHash !== hash` → `404 { error: 'hash mismatch' }`
  - 成功 → `200`、`content-type: image/webp`、`cache-control: public, max-age=31536000, immutable`、`etag: "<hash>-<n>"`、ボディは webp バイナリ
  - `PageOutOfRangeError` → `404 { error: 'out of range' }`
- `packages/note-first-presenter/src/vite/__tests__/plugin.test.ts:141-260` — 既存ハーネス:
  - `createMockReq(method, url, body?)` — `Readable.from` ベースのモックリクエスト
  - `createMockRes()` — `statusCode` / `headers`（小文字キー）/ `body: Buffer` / `done: Promise<void>` を持つモックレスポンス
  - `asRes(res)` — 型変換ヘルパ
  - 既存 describe `createApiMiddleware` は `getSlidesStatus: () => NO_SLIDES` と throw する `getSlides` の**モジュールレベル共有 `mw`** を使っている。新テストは別の `mw` を作る必要がある（下記 Step 1）。
- 実 PDF フィクスチャ: `packages/note-first-presenter/src/__tests__/fixtures/sample.pdf`（`slides.test.ts:7` が `SAMPLE_PDF` として解決している）。`openSlides(SAMPLE_PDF)` で実 `Slides` が得られる。
- `useTempCwd` ヘルパ（`src/__tests__/helpers.ts`）— 画像キャッシュ書き込み（`node_modules/.note-first-presenter/` 配下）を一時 cwd に隔離するために使う。plugin.test.ts が既に使っているか確認し、使っていなければ新 describe 内で呼ぶ。

## Commands you will need

| Purpose                        | Command                                     | Expected on success |
| ------------------------------ | ------------------------------------------- | ------------------- |
| Install                        | `vp install`                                | exit 0              |
| Format+lint+typecheck          | `vp check`                                  | exit 0              |
| CLI パッケージのユニットテスト | `vp run --filter note-first-presenter test` | all pass            |

**注意**: テストは `vp test` / `vp run` 経由で走らせること（vite-plus 0.2.x で素の `vitest` の破損は解消済みだが、リポジトリの標準経路は `vp`）。

## Scope

**In scope**:

- `packages/note-first-presenter/src/vite/__tests__/plugin.test.ts`（テスト追加のみ）

**Out of scope**:

- `packages/note-first-presenter/src/vite/plugin.ts` — プロダクションコードは一切変更しない。テストを通すために変更したくなったら STOP（それはバグ発見なので報告）。
- e2e 層への追加 — ここはユニット層で守るべき分岐。

## Git workflow

- Branch: `advisor/005-slide-image-middleware-tests`
- Commit style: conventional commit は使わない（例: `Cover the slide-image branch of the api middleware`）
- push / PR 作成はオペレーターの指示がない限り行わない。

## Steps

### Step 1: 実 Slides を配線した describe を追加する

`plugin.test.ts` に新しい describe `createApiMiddleware slide images` を追加する。共有 `mw` は使わず、`SAMPLE_PDF` への実 `Slides` を返すミドルウェアを組む:

```ts
const SAMPLE_PDF = path.resolve(import.meta.dirname, '../../__tests__/fixtures/sample.pdf');
// resolved 状態と実 Slides を返す
const slides = openSlides(SAMPLE_PDF);
const mw = createApiMiddleware({
  getSlidesStatus: () => ({ kind: 'resolved', path: SAMPLE_PDF }),
  getSlides: () => slides,
});
```

`openSlides` は `../../slides.ts` から import（拡張子必須）。画像キャッシュの書き込み先を隔離するため describe 内で `useTempCwd('nfp-mw-')` を使う — その場合 `SAMPLE_PDF` は `import.meta.dirname` 基準の絶対パスなので cwd 変更の影響を受けない。ただし `openSlides` の cacheRoot は cwd 相対（`node_modules/.note-first-presenter`）なので、**`openSlides` の呼び出しは各テスト内（chdir 後）で行う**か、`opts.cacheRoot` に一時パスを渡す形にする。既存の `slides.test.ts` の作法を確認して合わせること。

先に有効な hash を得るヘルパを作る: `const { hash } = await slides.meta();`

**Verify**: `vp check` → exit 0

### Step 2: 5 ケースを書く

1. **有効な hash + 有効ページ → 200**: `GET /api/slide/${hash}/1` で `statusCode === 200`、`headers['content-type'] === 'image/webp'`、`headers['cache-control'] === 'public, max-age=31536000, immutable'`、`headers['etag'] === `"${hash}-1"``、`body.length > 0`。
2. **hash 不一致 → 404**: `GET /api/slide/wronghash/1` で 404、ボディ JSON が `{ error: 'hash mismatch' }`。
3. **範囲外ページ → 404**: `GET /api/slide/${hash}/999` で 404、`{ error: 'out of range' }`。
4. **ページ 0 → 400**: `GET /api/slide/${hash}/0` で 400、`{ error: 'invalid page' }`。
5. **slides 未解決 → 404**: 未解決ステータスの mw（既存の `NO_SLIDES` を流用した別 mw）で `GET /api/slide/x/1` が 404、`{ error: 'slides not available' }`。

既存テストのアサーションスタイル（`await res.done` → `expect(res.statusCode)` → `JSON.parse(res.body!.toString())`）に合わせる。

**Verify**: `vp run --filter note-first-presenter test` → all pass、新規 5 テストを含む

### Step 3: 全体検証

**Verify**: `vp check && vp run test:unit` → ともに exit 0

## Test plan

このプラン自体がテスト追加。パターンの手本は同ファイルの既存 `createApiMiddleware` describe と `src/__tests__/slides.test.ts`（実 PDF の扱い）。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `vp check` exits 0
- [ ] `vp run --filter note-first-presenter test` exits 0、slide-image 分岐の 5 テストが存在して通る
- [ ] `git diff --stat` の変更が `plugin.test.ts` のみ
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

Stop and report back (do not improvise) if:

- テストを書いた結果、`plugin.ts` 側の実挙動が本プラン記載の期待（ステータスコード・ヘッダ値）と食い違う — それはプロダクションコードのバグか本プランの誤りなので、どちらか判断せず報告。
- pdfjs レンダリングがテスト環境で失敗する（`@napi-rs/canvas` のネイティブ依存問題等）— `slides.test.ts` の既存テストも同様に落ちるか確認して報告。
- 共有 `Slides` インスタンスの使い回しでテスト間干渉が出て、2 回の修正試行で解消しない場合。

## Maintenance notes

- Plan 003（pdfjs ライフサイクル）が後から入る場合、この describe の実 Slides 配線は invalidate 追加の回帰も自然に検知する。
- レビュー観点: アサーションが実装の内部（キャッシュパス等）でなく HTTP 契約（status/headers/body）だけに向いていること。
- 意図的に見送ったもの: ETag 条件付きリクエスト（If-None-Match → 304）のテスト — 実装自体が 304 を返さないため。304 対応を入れるなら別プラン。
