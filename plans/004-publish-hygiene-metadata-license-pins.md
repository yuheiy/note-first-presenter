# Plan 004: 公開前ハイジーン — package.json メタデータ・LICENSE・chokidar カタログ化

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 34b727b..HEAD -- packages/note-first-presenter/package.json packages/client/package.json pnpm-workspace.yaml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW（メタデータ・LICENSE・カタログ参照の変更のみ。依存の解決バージョンは変わらない）
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `c4a6e81`, 2026-07-19。**Refreshed at commit `34b727b`, 2026-07-21** — 旧 Step 4（`@latest` のピン留め）は commit `34b727b` の vite-plus 0.2.x アップグレードで独立に解消済みのため削除。

## Why this matters

CLI パッケージ `note-first-presenter` は `bin` エントリと `files` フィールドを持つ「公開する前提」のパッケージだが、`package.json` にテンプレートの残骸がそのまま残っている: description が "A starter for creating a TypeScript package."、author が "Author Name"、repository/homepage/bugs が実在しない `github.com/author/library`。このまま publish すると npm ページに誤った説明とデッドリンクが載る。`license: "MIT"` 宣言に対して LICENSE ファイルがリポジトリのどこにもないのも法的に弱い。

また `chokidar` だけカタログを経由せずリテラル指定になっている一貫性の問題もある。（当初この プランに含まれていた「catalog の `@latest` 指定のピン留め」は、commit `34b727b` の vite-plus 0.2.x アップグレードで独立に解消済み — catalog は現在 `vite-plus-core@0.2.5` / `vitest 4.1.10` / `vite-plus 0.2.5` に固定されている。）

## Current state

- `packages/note-first-presenter/package.json:3-14` — テンプレート残骸:
  ```json
  "description": "A starter for creating a TypeScript package.",
  "homepage": "https://github.com/author/library#readme",
  "bugs": { "url": "https://github.com/author/library/issues" },
  "license": "MIT",
  "author": "Author Name <author.name@mail.com>",
  "repository": { "type": "git", "url": "git+https://github.com/author/library.git" },
  ```
  同様の残骸が `packages/client/package.json:3-13` にもある。両方 `version: 0.0.0`。
- CLI の依存（`packages/note-first-presenter/package.json:38`）: `"chokidar": "^5.0.0"`（リテラル）。他の依存はすべて `"catalog:"` 経由。
- `pnpm-workspace.yaml` の catalog 抜粋（`@latest` は既に解消済み）:
  ```yaml
  vite: npm:@voidzero-dev/vite-plus-core@0.2.5 # line 12
  vitest: 4.1.10 # line 13
  vite-plus: 0.2.5 # line 14
  chokidar: ^5.0.0 # line 29
  ```
  `overrides:` セクション（line 47-52）に `chokidar: 'catalog:'` のワークスペース強制が増えているが、パッケージ側 `package.json` のリテラル指定はそのまま — 一貫性のための Step 3（`"catalog:"` への変更）は依然必要。
- リポジトリの実 URL: `https://github.com/yuheiy/note-first-presenter`。作者: Yuhei Yasuda。
- LICENSE ファイル: リポジトリ全体に存在しない（ルート・各パッケージとも）。npm pack はパッケージディレクトリ直下の `LICENSE` ファイルを自動同梱する（`files` に列挙不要）。
- client パッケージ（`@note-first-presenter/client`）は CLI の peerDependency であり、CLI を npm から使うには client も公開される必要がある — 両パッケージともメタデータ整備の対象。

## Commands you will need

| Purpose               | Command                   | Expected on success |
| --------------------- | ------------------------- | ------------------- |
| Install（ロック更新） | `vp install`              | exit 0              |
| Format+lint+typecheck | `vp check`                | exit 0              |
| 全ユニットテスト      | `vp run test:unit`        | all pass            |
| CLI 統合テスト        | `vp run test:integration` | all pass            |
| e2e                   | `vp run test:e2e`         | all pass            |

## Scope

**In scope**:

- `packages/note-first-presenter/package.json`
- `packages/client/package.json`
- `pnpm-workspace.yaml`（catalog の 3 行のみ）
- `pnpm-lock.yaml`（`vp install` による更新のみ、手編集しない）
- `LICENSE`（ルートに新規作成）
- `packages/note-first-presenter/LICENSE`、`packages/client/LICENSE`（ルートのコピー）

**Out of scope**:

- 実際の `npm publish` / バージョン付与の運用（`0.1.0` に上げるのは publish 直前の作業として保留。version は 0.0.0 のままにする）。
- README の充実 — 別プラン候補（DOCS-02）。
- 依存の**アップグレードやピン変更** — catalog のバージョンには一切触れない。特に `vitest` の catalog エントリは vp の同梱バージョンに正確に一致させてあり、`vite-plus` と切り離して動かすと壊れる（更新は `vp migrate` で lockstep に行う運用 — CLAUDE.md 参照）。

## Git workflow

- Branch: `advisor/004-publish-hygiene`
- Commit style: conventional commit は使わない（例: `Fix package metadata, add LICENSE, and route chokidar through the catalog`）
- push / PR 作成はオペレーターの指示がない限り行わない。

## Steps

### Step 1: package.json メタデータを実値にする

両パッケージの `description` / `author` / `homepage` / `bugs` / `repository` を修正:

- author: `Yuhei Yasuda`
- homepage: `https://github.com/yuheiy/note-first-presenter#readme`
- bugs.url: `https://github.com/yuheiy/note-first-presenter/issues`
- repository: `{ "type": "git", "url": "git+https://github.com/yuheiy/note-first-presenter.git" }`。モノレポなので各パッケージに `"directory": "packages/note-first-presenter"`（client は `"packages/client"`）も付ける。
- description（CLI）: `A presentation tool where you write notes first in an outliner, then pair them with slide images rendered from a PDF.`（CONTEXT.md の定義文に基づく）
- description（client）: `UI client for note-first-presenter.`

**Verify**: `node -e "const p=require('./packages/note-first-presenter/package.json'); if(/author\/library|Author Name|starter/.test(JSON.stringify(p))) process.exit(1)"` → exit 0（client 側も同様に確認）

### Step 2: LICENSE を追加する

ルートに MIT ライセンス全文の `LICENSE` を作成（copyright 行は `Copyright (c) 2026 Yuhei Yasuda`）。同内容を `packages/note-first-presenter/LICENSE` と `packages/client/LICENSE` にコピーする。

**Verify**: `ls LICENSE packages/note-first-presenter/LICENSE packages/client/LICENSE` → 3 ファイルとも存在

### Step 3: chokidar をカタログ経由にする

`packages/note-first-presenter/package.json` の `"chokidar": "^5.0.0"` を `"chokidar": "catalog:"` に変更（catalog 側に `chokidar: ^5.0.0` は既にある）。

**Verify**: `vp install` → exit 0、`git diff pnpm-lock.yaml` が空か軽微（バージョン解決は変わらないはず）

### Step 4: 全テストで回帰がないことを確認する

メタデータと catalog 参照の変更のみなので挙動は同一のはず。フル検証する:

**Verify**: `vp check && vp run test:unit && vp run test:integration && vp run test:e2e` → すべて exit 0

## Test plan

- 新規テストなし（設定変更のみ）。検証は既存の全テスト層 + Step 1 の grep 検証で行う。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "author/library\|Author Name\|A starter for creating" packages/*/package.json` がマッチしない
- [ ] `LICENSE` がルートと両パッケージに存在する
- [ ] `grep -n "chokidar" packages/note-first-presenter/package.json` の値が `"catalog:"` である
- [ ] `grep -n "@latest\|: latest" pnpm-workspace.yaml` がマッチしない（34b727b 時点で既に成立 — 回帰ガードとして残す）
- [ ] `vp check`、`vp run test:unit`、`vp run test:integration`、`vp run test:e2e` すべて exit 0
- [ ] `git status` で in-scope 以外の変更ファイルがない
- [ ] `plans/README.md` のステータス行を更新

## STOP conditions

Stop and report back (do not improvise) if:

- Step 3 の `vp install` で `pnpm-lock.yaml` の chokidar 解決バージョンが変わる場合（catalog 参照化はバージョン不変のはず）— 差分を添えて報告。
- e2e が環境要因（Playwright ブラウザ未導入等）で落ちる場合 — `playwright install` を 1 度試し、それでも落ちるなら失敗ログを添えて報告。

## Maintenance notes

- 以後の依存更新は catalog の 1 箇所を意図的に上げる運用（renovate/dependabot を入れるならこのファイルを対象にする）。ただし `vitest` / `vite-plus` / `vite`（vite-plus-core）は `vp migrate` で lockstep に更新すること。
- レビュー観点: `pnpm-lock.yaml` の差分が「specifier の変更のみ」で、解決バージョンの意図しないジャンプがないこと。
- 意図的に見送ったもの: version 0.1.0 への引き上げ（publish 直前に行う）、`npm publish --dry-run` での同梱確認（publish 作業時のチェックリストに回す）。
