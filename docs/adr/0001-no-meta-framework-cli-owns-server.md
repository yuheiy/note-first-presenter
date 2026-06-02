# メタフレームワークを使わず、CLI がサーバと Vite を全所有する

当初は SvelteKit で開始したが、フレームワークが「バンドル内サーバー（`+server.ts`）」を所有することが、サーバ責務と仮想モジュール注入を CLI パッケージと client パッケージに二分する構造を強制していた。これを解消するため SvelteKit を撤去し、Node/サーバ/Vite/仮想モジュールをすべて CLI（`note-first-presenter`）が所有し、client は API ミドルウェアへ JSON を fetch するだけの純 Svelte SPA とする。ルーティングは単一 `index.html` + SPA フォールバックとし、マウント時に `location.pathname` を1度読んで `Presenter`/`Slideshow` を出し分ける（クライアントルータ・SSR・プリレンダリングなし）。

## Considered Options

- **SvelteKit を維持**: 却下。仮想モジュール契約の dev/build 二重実装、サーバ責務の二分、逆依存の暗黙化を生み続ける。
- **hash ルーティング / 属性ベースルーティング / クライアントルータ（pushState 遷移）**: 却下。最終形は素のリンク（フルリロード）＋ History API はスライド位置 `?slide=N` のみ。

## Consequences

- 静的ビルドは `index.html` を `200.html` へコピーして SPA フォールバックを賄う。
- `virtual:nfp/mode` は Vite `define` 定数 `__NFP_STATIC__` に置換され、Vite config を CLI が一元所有することで dev/build の二重実装が構造的に消える。
- `<html lang/dir>` は SSR ではなくマウント時にクライアントが設定する。
