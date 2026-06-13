# PDF 変化時の反映をフルリロードから部分更新へ（Vite HMR ws の custom event）

dev/Editor モードで PDF（または config）が変化したとき、ブラウザのフルリロードを送る代わりに、
Vite の HMR WebSocket に独自イベント `nfp:slides-changed` を流し、クライアントは
スライドのメタ情報（`/api/slides/meta`）を再取得してスライドだけを差分更新する。

## 動機

- PDF を再エクスポートするたびに `ViteNfpPlugin` が `server.ws.send({ type: 'full-reload' })` を送り、
  ブラウザが全体リロードしていた。これにより ProseMirror アウトラインの編集コンテキスト
  （カーソル・選択・スクロール位置・undo 履歴、500ms デバウンス中の未保存編集）が失われる。
- author は「スライドを差し替えながらノートを書く」ワークフローのため、
  ノート編集状態を壊さずにスライドだけ静かに差し替えたい。

## 設計決定

### トランスポート: Vite 既存の HMR WebSocket を再利用

新たな WebSocket / SSE を立てず、すでに `full-reload` を送っている `server.ws` に
独自イベントを相乗りさせる（Vite が公式に提供する custom HMR event 機構）。

```ts
// CLI: packages/note-first-presenter/src/vite/plugin.ts（configureServer 内）
onSettle: () => server.ws.send({ type: 'custom', event: 'nfp:slides-changed' }),
```

```ts
// client: packages/client/src/lib/slides-meta/live-reload.ts
export function onSlidesChanged(handler, hot = import.meta.hot) {
  if (!hot) return () => {};
  hot.on(SLIDES_CHANGED_EVENT, handler);
  return () => hot.off(SLIDES_CHANGED_EVENT, handler);
}
```

`import.meta.hot` は dev でしか存在しないため、この経路は本番の静的ビルドで自動的に no-op になる。
スコープが dev/Editor 限定であることと一致する。

### ペイロードはシグナルのみ

イベントには新しい hash 等を載せず、クライアントは受信したら既存の `SlidesMetaStore.load()` を
呼んで `/api/slides/meta` を再取得する。初回ロードとライブ更新が同一コードパスを通り、サーバを
単一の真実源に保てる。スライド画像 URL は content hash 入り（`/api/slide/{hash}/{n}`）なので、
hash が変われば URL が変わり、Svelte のリアクティビティ（`meta.data` の `$state` →
`SlideList` の props → `SlideImage` の src）で画像とページ数が連鎖更新される。

### 購読は Editor のみ

`Editor.svelte`（dev/Editor モードの所有者）の `onMount`/cleanup で購読する。読み取り専用の
`Viewer.svelte`（静的ビルド・サーバなし）には入れない。

### エラー経路（`onError`）は据え置き

`onSettle` のみを差し替え、`onError`（Vite のエラーオーバーレイ）はそのまま残す。
`reload()` は config 解決のみで PDF をパースしないため、`onError` が発火するのは
`note-first-presenter.config.ts|js` の評価エラー・valibot 形状エラーのみで、PDF 再エクスポートとは
無関係。壊れた/書き込み途中の PDF は meta/image fetch 時のエラーとして `SlidesMetaStore.load()` の
catch（`SlidesStatus` の非 resolved 種別を含む）が inline で処理する。

## Considered Options

- **専用 WebSocket（`ws` パッケージ追加）**: 却下。新規依存と接続管理の自前実装が増える。
  既存の `server.ws` で十分で、`full-reload` を置き換えるだけで済む。
- **SSE（EventSource）エンドポイントを middleware に追加**: 却下。push 専用としては軽いが、
  やはり別経路の自前管理になり、Vite の HMR ライフサイクル（再接続等）の恩恵を捨てる。
- **ペイロードに meta をインライン同梱**: 却下。往復は削減できるが、初回ロードと別コードパスになり、
  サーバの `SlidesStatus` 形状変更がクライアントの受信ハンドラに波及する。meta エンドポイントを
  唯一の契約面に保つ方を優先した。
- **active スライドのクランプを追加**: 見送り（スコープ外）。PDF が縮んで active が範囲外を指す状況は
  フルリロード時（URL `?slide=N` 復元）と完全に同一挙動で、本変更で新たな退行は生じない。

## Consequences

- ADR-0007 の方針（watcher と API は `ViteNfpPlugin` に集約）の延長として、push も同プラグイン内に閉じる。
- `nfp:slides-changed` という文字列定数が CLI とクライアントの 2 パッケージに重複する。ADR-0002
  （2 パッケージ・共有コードゼロ）に従い重複は許容し、e2e（`e2e/live-update.e2e.ts`）で end-to-end に
  両者の一致を検証する。
- 本番 Viewer のライブ更新は対象外のまま。将来 Viewer でもライブ更新が必要になった場合は、
  本 ADR の前提（dev 専用・`import.meta.hot` 依存）を見直し、独立した push 基盤を再検討する。
