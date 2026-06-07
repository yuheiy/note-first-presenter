Status: ready-for-agent

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
