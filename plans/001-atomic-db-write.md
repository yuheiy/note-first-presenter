# Plan 001: アウトライン db の書き込みをアトミック化し、並行 PUT を直列化する

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c4a6e81..HEAD -- packages/note-first-presenter/src/db.ts packages/note-first-presenter/src/__tests__/db.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c4a6e81`, 2026-07-19

## Why this matters

`.note-first-presenter.json` はユーザーのアウトライン全体（このツールの存在理由そのもの）を保持する唯一のファイルであり、クライアントは編集のたびに 500ms デバウンスで `PUT /api/db` を送り、サーバは毎回このファイルを上書きする。現在の `writeDb` は `fs.writeFile` の直接呼び出し（open → truncate → write）なので、書き込み途中のクラッシュ・Ctrl-C・ディスクフルでファイルが切り詰められたまま残る。次回の `readDb` は valibot パースで例外を投げ、`GET /api/db` が 500 になり、アウトラインは復元不能になる。さらに PUT ハンドラは直列化されていないため、重なった 2 つの PUT が同時に `writeFile` を走らせる可能性もある。temp ファイル + `fs.rename`（同一ファイルシステム上でアトミック）と書き込みの直列化で両方を塞ぐ。

## Current state

- `packages/note-first-presenter/src/db.ts` — db の read/write と valibot スキーマ。全 49 行。
- `packages/note-first-presenter/src/vite/plugin.ts:216-233` — `PUT /api/db` ハンドラ。`v.safeParse(dbInputSchema, body)` 成功時に `await writeDb(result.output)` を呼ぶ。**このファイルは変更しない**（直列化は `writeDb` 内部に閉じる）。
- `packages/note-first-presenter/src/__tests__/db.test.ts` — 既存テスト。`useTempCwd('nfp-db-')` で一時ディレクトリに chdir して実行するパターン。

現在の `writeDb`（`db.ts:47-49`）:

```ts
export async function writeDb(db: DbInput): Promise<void> {
  await fs.writeFile(DB_FILENAME, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}
```

`DB_FILENAME` は `db.ts:12` で `'.note-first-presenter.json'`（cwd 相対）。既存テストは「pretty-printed JSON + 末尾改行」を検証しているので、シリアライズ形式は変えないこと。

テストのヘルパ `useTempCwd` は `packages/note-first-presenter/src/__tests__/helpers.ts` にある（beforeEach で `mkdtemp` + `chdir`、afterEach で復帰・削除）。

リポジトリ規約: CLI パッケージは `.ts` ソース配信（ADR-0010）。相対 import は拡張子必須（`./db.ts`）。erasable でない TS 構文（enum 等）は禁止。コメント密度は低め、英語コメント。

## Commands you will need

| Purpose                        | Command                                     | Expected on success |
| ------------------------------ | ------------------------------------------- | ------------------- |
| Install                        | `vp install`                                | exit 0              |
| Format+lint+typecheck          | `vp check`                                  | exit 0              |
| CLI パッケージのユニットテスト | `vp run --filter note-first-presenter test` | all pass            |
| 全ユニットテスト               | `vp run test:unit`                          | all pass            |

**警告**: 素の `vitest` は絶対に起動しないこと（`vp exec vitest run` も不可）。二重の `@vitest/runner` が読み込まれて壊れる。テストは必ず `vp test` / `vp run` 経由。

## Scope

**In scope**（変更してよいのはこれだけ）:

- `packages/note-first-presenter/src/db.ts`
- `packages/note-first-presenter/src/__tests__/db.test.ts`

**Out of scope**:

- `packages/note-first-presenter/src/vite/plugin.ts` — PUT ハンドラは変更不要。直列化は `writeDb` 内で完結させる。
- クライアント側の保存経路（`packages/client/**`）— Plan 002 が扱う。
- `readDb` のエラーハンドリング変更（破損ファイルの自動リカバリ等）— 今回のスコープ外。

## Git workflow

- Branch: `advisor/001-atomic-db-write`
- Commit style: conventional commits（例: `fix: make outline db writes atomic and serialized`）
- push / PR 作成はオペレーターの指示がない限り行わない。

## Steps

### Step 1: `writeDb` を temp+rename に変更し、モジュールレベルで直列化する

`db.ts` の `writeDb` を次の形にする:

```ts
let writeChain: Promise<void> = Promise.resolve();

export function writeDb(db: DbInput): Promise<void> {
  const run = writeChain.then(async () => {
    const tmp = `${DB_FILENAME}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, DB_FILENAME);
  });
  // Keep the chain alive even when a write fails so later writes still run.
  writeChain = run.catch(() => {});
  return run;
}
```

ポイント:

- シリアライズ形式（pretty-print + 末尾改行）は既存のまま。
- 失敗した書き込みが後続の書き込みを止めないよう、チェーンは catch 済みの promise で更新する。呼び出し元には元の rejection をそのまま返す。

**Verify**: `vp check` → exit 0

### Step 2: テストを追加する

`packages/note-first-presenter/src/__tests__/db.test.ts` の `describe('readDb / writeDb')` 内に追加（既存のスタイルに合わせる）:

1. **rename 後に temp ファイルが残らない**: `writeDb(...)` 後、`fs.readdir('.')` に `.note-first-presenter.json.tmp` が含まれないこと。
2. **並行書き込みが直列化され、最後の値で終わる**: `await Promise.all([writeDb(dbA), writeDb(dbB)])` の後、`readDb()` が `dbB` を返し、ファイルが有効な JSON であること（`dbA`/`dbB` は `title` だけ変えた有効な db オブジェクト）。
3. **既存テストがすべて通る**（形式回帰なし）。

**Verify**: `vp run --filter note-first-presenter test` → all pass、新規 2 テストを含む

### Step 3: 全体検証

**Verify**: `vp check && vp run test:unit` → ともに exit 0

## Test plan

- 上記 Step 2 の 2 テスト。パターンは同ファイルの既存テスト（`useTempCwd` + 実ファイル読み書き + `expect`）に従う。モックは使わない。
- 統合層（`vp run test:integration`）は変更の影響を受けないはずだが、時間があれば 1 回流して回帰がないことを確認。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `vp check` exits 0
- [ ] `vp run --filter note-first-presenter test` exits 0、`db.test.ts` に temp-file と並行書き込みのテストが存在して通る
- [ ] `grep -n "await fs.writeFile(DB_FILENAME" packages/note-first-presenter/src/db.ts` がマッチしない（直接上書きの消滅）
- [ ] `git status` で in-scope 以外の変更ファイルがない
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

Stop and report back (do not improvise) if:

- `db.ts` の現状が上の抜粋と一致しない（プラン作成後にドリフトした）。
- `fs.rename` が実行環境で既存ファイルの上書きに失敗する（EXDEV 等）— cwd 内の temp なので起きないはずだが、起きたら報告。
- 修正が `plugin.ts` 側の変更を要するように見えた場合（見えても触らず報告）。

## Maintenance notes

- 将来 db にバージョンマイグレーション（version 2）を足す場合も、書き込みは必ずこの `writeDb` を通すこと。
- レビュー観点: rejection 後もチェーンが生きること（catch 済み promise での更新）と、返り値が元の promise であること（エラーが呼び出し元の 500 応答に正しく伝播する）。
- 意図的に見送ったもの: 破損ファイル検出時のバックアップ復元。アトミック化により破損経路自体が塞がるため YAGNI。
