Status: wontfix

# Replace custom chokidar watchers with Vite built-in server.watcher

## Context

`packages/note-first-presenter/src/vite/plugin.ts` の `createSlidesContext` は、chokidar インスタンスを3つ自前で管理している:

1. `rootWatcher` — cwd の `*.pdf` を監視（add/unlink）
2. `configWatcher` — 設定ファイル群を監視
3. `dynamicWatcher` — 設定の依存ファイルと解決済み PDF パスを監視

Slidev は同様の要件に対して `server.watcher.add(paths)` で Vite dev server 内蔵の chokidar インスタンスを再利用し、`handleHotUpdate` フックで変更を受け取っている。

## Motivation

- chokidar インスタンスの多重管理を排除し、リソース消費と複雑性を削減する
- `handleHotUpdate` を活用することで、Vite の HMR パイプラインと自然に統合される
- watcher のライフサイクル管理（`close()`）が Vite 側に委譲される

## Proposed approach

1. `configureServer` 内で `server.watcher.add(paths)` を使い、監視対象を Vite の watcher に追加する
2. `handleHotUpdate(ctx)` フックを実装し、`ctx.file` が対象ファイル（PDF、設定、設定の依存）に該当するか判定する
3. 該当する場合に `reload()`（slides 再解決）を呼び出し、必要に応じて `ctx.server.hot.send({ type: 'full-reload' })` を発火する
4. slides status の変化に応じて動的に `server.watcher.add()` / unwatch する（PDF パスが変わった場合など）
5. 自前の chokidar インスタンス（`rootWatcher`, `configWatcher`, `dynamicWatcher`）と `close()` 処理をすべて除去する

## Notes

- `server.watcher` は Vite dev server 専用。build 時には存在しないため、build パスには影響しない
- `awaitWriteFinish` の挙動が Vite の watcher 設定に依存する点に注意（必要なら `server.config.server.watch` で設定）
- `handleHotUpdate` は変更ファイルに対応する Vite モジュールがある場合のみ呼ばれる。`*.pdf` のような非モジュールファイルには `server.watcher.on('change', ...)` で対応する必要がある可能性がある

## Comments

2026-06-10 — 設計検討の結果、本 issue は却下(wontfix)とする。理由:

1. **監視対象がすべて Vite root の外にある。** dev サーバは `root: clientRoot`(client パッケージ)で起動し、監視対象(ユーザー cwd の `*.pdf`・設定ファイル・設定の依存)は `projectCwd` 配下にあって Vite のモジュールグラフに決して載らない。`handleHotUpdate` を使っても `modules` は常に空であり、「HMR パイプラインとの自然な統合」という motivation には実体がない。
2. **`server.watcher` の glob 対応はバンドルされた chokidar のバージョンに依存する。** vite-plus-core 0.1.24 は chokidar 3.6.0(glob 対応)を同梱するが、chokidar は v4 で glob サポートを削除済み。上流が chokidar を更新した時点で `server.watcher.add('*.pdf')` は静かに壊れる。これは下記 3 と同型の罠である。
3. **調査の過程で、自前の `rootWatcher` が既に壊れていることが判明した。** 本パッケージは chokidar v5 に依存しており、`chokidar.watch('*.pdf', { depth: 0 })` の glob はリテラルファイル名として扱われ、add/unlink イベントは一切発火しない(検証済み)。`configWatcher`(リテラルパス・非存在ファイル含む)と `dynamicWatcher`(絶対パス)は v5 でも正常に機能している。

chokidar の自前管理は維持し、実在するバグの修正は `02-fix-root-watcher-broken-glob.md` で扱う。
