# Plan 002: デバウンス中の未保存編集を unload 時に flush し、保存失敗をリトライ可能にする

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c4a6e81..HEAD -- packages/client/src/lib/db/client.svelte.ts packages/client/src/lib/db/__tests__/db-client.test.ts packages/client/src/lib/workspace/Editor.svelte`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（Plan 001 と独立。ただし同時に着手しないこと — 保存経路の両端を同時に変えるとバグの切り分けが難しくなる）
- **Category**: bug
- **Planned at**: commit `c4a6e81`, 2026-07-19

## Why this matters

Editor の保存は 500ms デバウンスされた `PUT /api/db` のみで行われ、`flush()` を呼ぶのはデバウンスタイマーだけ。つまり:

1. 最後の編集から 500ms 以内にタブを閉じる／リロード／遷移すると、その編集は**無音で失われる**。
2. PUT が失敗すると `saveStatus='error'` は表示されるが dirty 状態は保持されず、ユーザーが追加編集しない限り**二度と再送されない**。
3. flush の多重実行ガードがなく、連続編集で in-flight の PUT が重なると古い状態が後勝ちで永続化されうる。

ノートがこのプロダクトの主データなので、この 3 つはすべてデータ喪失バグとして扱う。

## Current state

- `packages/client/src/lib/db/client.svelte.ts` — `DbStore`（Svelte 5 runes のクラスストア）。全 54 行。現状:

```ts
export const SAVE_DEBOUNCE_MS = 500;
// ...
export class DbStore {
  state: DbV1 = $state(defaultDb());
  saveStatus: 'idle' | 'saving' | 'error' = $state('idle');
  lastError: string | null = $state(null);

  #save: (db: DbV1) => Promise<void>;
  #timer: ReturnType<typeof setTimeout> | null = null;
  // ...
  #scheduleSave() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  async flush() {
    this.#timer = null;
    this.saveStatus = 'saving';
    try {
      await this.#save({ ...this.state });
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }
}
```

`setTitle`/`setOutline` が `#scheduleSave()` を呼ぶ。`replace()` は保存をスケジュールしない（サーバから読み込んだ状態の反映用 — この性質は維持すること）。

- `packages/client/src/lib/workspace/Editor.svelte:13-16` — DbStore の生成箇所:

```ts
const db = new DbStore({
  initial: defaultDb(),
  save: (state) => api('/api/db', { method: 'PUT', body: state }),
});
```

`Editor.svelte` の `onMount` は現在 `onSlidesChanged` の解除関数だけを返している。

- `packages/client/src/lib/server-client.ts` — `api = ofetch.create({ retry: 0, responseType: 'json', ignoreResponseError: false })`。ofetch は fetch オプションをそのまま透過するので `keepalive: true` を渡せる。
- `packages/client/src/lib/db/__tests__/db-client.test.ts` — 既存テスト。`vi.useFakeTimers()` + モック `save` のパターン。新テストはこれに倣う。
- テスト層: `*.test.ts`（`.svelte.test.ts` でない）は Node の `server` プロジェクトで走る。`DbStore` は `.svelte.ts` だが既存テストが Node 層にあるので同じ場所に足す。

リポジトリ規約: Svelte 5 runes（`$state`）、クラスベースストア、private field は `#`。CONTEXT.md の語彙では階層ドキュメントは「Outline」（doc と呼ばない）。

## Commands you will need

| Purpose                   | Command                                                                           | Expected on success |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------- |
| Install                   | `vp install`                                                                      | exit 0              |
| Format+lint+typecheck     | `vp check`                                                                        | exit 0              |
| svelte-check              | `vp exec --filter @note-first-presenter/client -- svelte-check --threshold error` | exit 0              |
| client パッケージのテスト | `vp run --filter @note-first-presenter/client test`                               | all pass            |
| 全ユニットテスト          | `vp run test:unit`                                                                | all pass            |

**警告**: 素の `vitest` は絶対に起動しないこと。ブラウザモードのテストは無音でハングする。必ず `vp test` / `vp run` 経由。

## Scope

**In scope**（変更してよいのはこれだけ）:

- `packages/client/src/lib/db/client.svelte.ts`
- `packages/client/src/lib/db/__tests__/db-client.test.ts`
- `packages/client/src/lib/workspace/Editor.svelte`（lifecycle 配線と `keepalive` のみ）

**Out of scope**:

- `packages/client/src/lib/server-client.ts` — グローバルな retry 設定は変えない（リトライは DbStore の dirty フラグで担う）。
- `packages/client/src/lib/workspace/Viewer.svelte` — 読み取り専用モード。保存経路がない。
- サーバ側（`packages/note-first-presenter/**`）— Plan 001 が扱う。
- `beforeunload` での離脱確認ダイアログ — UX 変更でありスコープ外。

## Git workflow

- Branch: `advisor/002-flush-pending-saves`
- Commit style: conventional commits（例: `fix(client): flush pending saves on unload and retry failed saves`）
- push / PR 作成はオペレーターの指示がない限り行わない。

## Steps

### Step 1: `DbStore` に dirty フラグ・多重実行ガード・失敗リトライを入れる

`client.svelte.ts` の `DbStore` を次の設計に変更する:

```ts
export const SAVE_RETRY_MS = 5000;

export class DbStore {
  // 既存の public フィールドはそのまま
  #dirty = false;
  #inflight = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  // setTitle / setOutline は変更後に this.#dirty = true; this.#scheduleSave(); とする
  // replace() は従来どおり dirty にしない

  #scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), delay);
  }

  async flush() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#inflight || !this.#dirty) return;
    this.#inflight = true;
    try {
      // Loop so edits made during an in-flight save are sent before settling.
      while (this.#dirty) {
        this.#dirty = false;
        this.saveStatus = 'saving';
        await this.#save({ ...this.state });
      }
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.#dirty = true;
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.#scheduleSave(SAVE_RETRY_MS); // bounded retry; next edit also reschedules
    } finally {
      this.#inflight = false;
    }
  }
}
```

意図:

- `#inflight` ガードで PUT の重なり（古い状態の後勝ち）を排除。
- while ループで「保存中に来た編集」を取りこぼさない。
- 失敗時は dirty を立て直し 5 秒後に自動リトライ。ユーザーが編集を続ければ通常のデバウンスが優先される。

**Verify**: `vp check` → exit 0

### Step 2: `Editor.svelte` で unload/hidden 時に flush する

`Editor.svelte` の `onMount` 内（既存の `return onSlidesChanged(...)` の手前）にリスナーを追加し、cleanup でまとめて解除する:

```ts
const flushNow = () => void db.flush();
window.addEventListener('pagehide', flushNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushNow();
});
```

cleanup は既存の `onSlidesChanged` 解除と合わせ、1 つの関数で `removeEventListener` する形に整理する（visibilitychange は名前付き関数にして解除可能にすること）。

あわせて DbStore 生成の `save` に `keepalive: true` を追加する:

```ts
save: (state) => api("/api/db", { method: "PUT", body: state, keepalive: true }),
```

`keepalive` により unload 中でも送信が完了する。keepalive リクエストのボディはブラウザ実装上 64KB 上限がある — 通常のアウトラインでは十分だが、超えた場合は通常の fetch と同じ失敗経路（dirty 保持）に落ちるだけで悪化はしない。

**Verify**: `vp exec --filter @note-first-presenter/client -- svelte-check --threshold error` → exit 0

### Step 3: テストを追加する

`db-client.test.ts` に追加（既存の fake-timers + モック save パターン）:

1. **失敗後の自動リトライ**: `save` を 1 回目 reject / 2 回目 resolve にし、編集 → デバウンス経過 → `saveStatus === 'error'` → `SAVE_RETRY_MS` 経過 → `save` が計 2 回呼ばれ `saveStatus === 'idle'`。
2. **in-flight 中の編集が取りこぼされない**: `save` を手動 resolve できる deferred にし、編集 A → flush 開始（in-flight）→ 編集 B → A の save を resolve → B の内容で `save` が再度呼ばれる（計 2 回、最後の呼び出し引数が B を含む）。
3. **多重 flush が重ならない**: in-flight 中に `flush()` を直接呼んでも `save` の同時呼び出しが発生しない（deferred 解決前に呼び出し回数が 1 のまま）。
4. **dirty でなければ flush は no-op**: `replace()` 直後の `flush()` で `save` が呼ばれない。

**Verify**: `vp run --filter @note-first-presenter/client test` → all pass、新規 4 テストを含む

### Step 4: 全体検証

**Verify**: `vp check && vp run test:unit` → ともに exit 0

## Test plan

- 上記 Step 3 の 4 テスト。`packages/client/src/lib/db/__tests__/db-client.test.ts` の既存スタイル（`vi.useFakeTimers`、`vi.fn()` の save モック、`vi.advanceTimersByTimeAsync`）に従う。
- `Editor.svelte` のリスナー配線はユニットテストで無理に検証しない（ブラウザイベントのモックはコストに見合わない）。svelte-check と手動確認で足りる。既存の `Workspace.svelte.test.ts` 群がマウント経路の回帰を拾う。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `vp check` exits 0
- [ ] `vp exec --filter @note-first-presenter/client -- svelte-check --threshold error` exits 0
- [ ] `vp run --filter @note-first-presenter/client test` exits 0、`db-client.test.ts` にリトライ／in-flight／多重 flush のテストが存在して通る
- [ ] `grep -n "pagehide" packages/client/src/lib/workspace/Editor.svelte` がマッチする
- [ ] `grep -n "keepalive" packages/client/src/lib/workspace/Editor.svelte` がマッチする
- [ ] `git status` で in-scope 以外の変更ファイルがない
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

Stop and report back (do not improvise) if:

- `client.svelte.ts` / `Editor.svelte` の現状が上の抜粋と一致しない。
- 既存テスト（特に「coalesces rapid edits into a single save」）が新設計で 2 回以上の save を要求するようになった場合 — デバウンス挙動の回帰なので設計を見直す前に報告。
- `$state` フィールドと `#` private フィールドの組み合わせで svelte-check がエラーを出し、2 回の修正試行で解消しない場合。

## Maintenance notes

- 将来オフライン対応や複数タブ編集を入れる場合、この dirty/in-flight 機構が競合解決の土台になる（現状はラストライター勝ち）。
- レビュー観点: while ループ内で `#dirty` を消してから `#save` を await する順序（逆にすると保存中の編集を取りこぼす）。`saveStatus` の遷移が UI（保存インジケータ）と整合すること。
- 意図的に見送ったもの: `navigator.sendBeacon`（ofetch 経路を二重化するため不採用、keepalive で足りる）、指数バックオフ（固定 5s で十分、ローカルサーバ相手のため）。
