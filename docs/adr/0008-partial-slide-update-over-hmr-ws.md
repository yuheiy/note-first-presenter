# PDF 変化時の反映をフルリロードから部分更新へ（Vite HMR ws の custom event）

dev で PDF（または config）が変化したとき、`full-reload` を送る代わりに Vite 既存の HMR WebSocket へ独自イベント `nfp:slides-changed` を流し、クライアントは meta を再取得してスライドだけを差分更新する。フルリロードは ProseMirror の編集コンテキスト（カーソル・選択・undo 履歴・デバウンス中の未保存編集）を破壊するため。

- **トランスポートは `server.ws` の相乗り**（Vite 公式の custom HMR event 機構）。専用 WebSocket / SSE は新規依存と接続管理の自前実装になるので退けた。`import.meta.hot` は dev にしか存在しないため、この経路は静的ビルドで自動的に no-op になる。
- **ペイロードはシグナルのみ。** meta をイベントに同梱すると初回ロードと別コードパスになり、サーバの `SlidesStatus` 形状変更が受信ハンドラに波及する。クライアントは受信したら meta エンドポイントを再取得し（現在は jotai の `atomWithRefresh` を refresh）、初回ロードと同一経路を通す。スライド画像 URL は content hash 入りなので、hash が変われば URL ごと連鎖更新される。
- `nfp:slides-changed` という文字列定数は CLI と client の2パッケージに意図的に重複し（共有パッケージを作らない方針、ADR-0013）、一致は e2e（`e2e/dev/liveUpdate.e2e.ts`）が end-to-end に検証する。
