# 素の Vite + React を UI 層に採用し、メタフレームワークもルータも入れない

client を SvelteKit + Svelte から**素の Vite + `@vitejs/plugin-react` + React** に書き直す。メタフレームワークもルータライブラリも入れない。2つのページ（ワークスペース / スライドショー）は `packages/client/index.html` 1枚と `src/main.tsx` 1本に集約し、起動時に URL を1度だけ読んで `React.lazy` で分岐先チャンクを選ぶ。CLI が `configFile: false` のインライン設定で Vite を全所有する原則は維持する。

このアプリの「2ルートの出し分け」は**ルーティングと呼ぶほどのものではない**。スライドショーは常に `target="nfp-slideshow"` で別ウィンドウに開かれ、戻る導線もないので、2ページが1つのドキュメント内で行き来することがない。必要なのは起動時に1度ページを選ぶことだけで、履歴連携もルート遷移も要らない。

なお、URL の形（当初は hash 固定）に関する判断は [ADR-0017](./0017-router-mode-and-base-without-a-router.md) が置き換えた（`routerMode` + `base` + `?slide=`）。「起動時に1回読む」「リスナを置かない」「ルータライブラリを入れない」は生きている。**「hash はサーバに届かない」という一文を根拠に何かを却下してはならない**（破棄の経緯は ADR-0017）。

## 設計決定

- **実アプリに効かせたい Vite プラグインは CLI の `createViteConfig` に追加する。** dev/build を担うのは CLI であり、`packages/client/vite.config.ts` はテスト/IDE 専用。プラグインは CLI の `dependencies` に宣言し、client の `vite.config.ts` にもテスト一貫性のため同じものを並べる（正本は CLI 側）。
- **エイリアスなし（相対 import）。** `$lib` の後継も subpath imports も入れない。エイリアスが解く問題（深すぎる `../../..`）が現に発生しておらず、足すたびに tsconfig と Vite の2箇所管理が戻ってくる。
- **HTML は `index.html` 1枚**（Vite の root 規約）。client `package.json` の `files` に `index.html` を含めないと公開パッケージが壊れる。テーマ初期化スニペット（FOUC 回避、ADR-0009）はここに置く。
- **db / slides meta の fetch は `main.tsx` で前倒し発火する。** チャンク DL と通信が並列になり、副次効果として StrictMode の effect 二重実行による二重 fetch も起きない。
- **Editor / Viewer の分岐は `import.meta.env.DEV`。** URL 空間を `/nfp-data/*` に統一済みなので、この軸の意味は「書き込めるか / 読むだけか」の1つだけ。
- **`<StrictMode>` は有効。** ProseMirror の生成/破棄は effect の cleanup で対称なので実害がなく、「マウント effect の依存に `onChange` 等が漏れて打鍵ごとにエディタが再生成される」類のバグを開発中に暴き続ける。

## Considered Options

- **React Router framework mode**: 却下。設定ファイル規約（`react-router.config.ts` 等）が「インライン設定が唯一の正本」と衝突する。
- **TanStack Start**: 却下。1.0 未満。
- **ルータライブラリだけ入れる**: 却下。2ページ間の遷移が存在しない以上、ルータが解く問題（マッチング・履歴・遷移）が1つも発生しない。
- **MPA 2エントリ（`index.html` + `slideshow/index.html`）**: 却下。`build.rollupOptions.input` と `appType: 'mpa'` を CLI 側に書くことになり、静的配信にディレクトリ構造への依存が残る。1枚で足りる。
