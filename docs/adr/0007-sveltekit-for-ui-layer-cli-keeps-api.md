# SvelteKit を UI 層に採用し、API は CLI の Vite プラグインに残す

Supersedes: ADR-0001, ADR-0006

純 Svelte SPA + 手動ルーティング（ADR-0001）から SvelteKit に移行する。ただし SvelteKit のサーバサイド機能（`+server.ts`、`hooks.server.ts`、SSR）は使わず、UI のファイルベースルーティングと `$lib` エイリアスのみを採用する。API ミドルウェアとファイル監視は CLI の Vite プラグイン（`ViteNfpPlugin`）に残す。

## 動機

- ファイルベースルーティングによりエントリポイントの手動分岐（`main.ts` での `location.pathname` 判定）を排除する
- `$lib` を SvelteKit 組み込みで解決し、`package.json` imports の配列フォールバック（ADR-0006）を不要にする
- `svelte-check` および IDE が `vite.config.ts` の `sveltekit()` から設定を読み取れるため、`svelte.config.js` を廃止できる
- テスト環境と実行環境で同じ `sveltekit()` を使い、エイリアス解決を一致させる

## 設計決定

### CLI とSvelteKit の統合

CLI は `configFile: false` で Vite を起動し、`sveltekit()` をインライン config で渡す（Slidev と同様のパターン）。`svelte.config.js` は存在しない。

```ts
createServer({
  root: clientRoot,
  configFile: false,
  plugins: [sveltekit({ kit: {} }), paraglideVitePlugin(...), ViteNfpPlugin()],
});
```

ビルド時は adapter をインラインで指定し、出力先を動的に制御する:

```ts
sveltekit({ kit: { adapter: adapterStatic({ pages: outDir, fallback: '200.html' }) } });
```

### SSR 無効化

全ページで `export const ssr = false` を設定する。このアプリは CLI のローカル UI であり、SSR の恩恵（SEO、初期表示）が不要。dev と build で挙動を一致させる。

### API の所在

`/api/*` エンドポイントは引き続き `ViteNfpPlugin` の `configureServer` で Connect middleware として提供する。SvelteKit の `+server.ts` は使わない。理由:

- ステートフルな watcher（chokidar）と API ハンドラが同一クロージャに閉じている現設計が単純
- SvelteKit のサーバルートに移すにはシングルトン注入が必要で、複雑性が増す
- API は4エンドポイントのみであり、SvelteKit の型安全なルーティングの恩恵が薄い

### パスエイリアス

`#lib/*`（package.json subpath imports）を `$lib/*`（SvelteKit 組み込み）に全置換する。`package.json` の `"imports"` フィールドは削除する。

### モード切替

`__NFP_STATIC__` define 定数を廃止し、`import.meta.env.DEV` で代替する。dev モード = ライブ API/編集可、production ビルド = 静的ファイル/読み取り専用は常に連動するため、Vite 組み込みの環境フラグで十分。

### paraglide

`hooks.server.ts` は使わない。`+layout.svelte` の `onMount` で `document.documentElement.lang/dir` をクライアントサイドで設定する。URL ベースの locale ルーティングは不要（ローカルツールのため）。

### テスト

client の `vite.config.ts` で `sveltekit({})` を使用する。テスト起動時に `sync.all()` が走り `.svelte-kit/` が自動生成されるため、`prepare` スクリプトや `svelte-kit sync` は不要。

## Considered Options

- **SvelteKit に全面移行（API も `+server.ts` に）**: 却下。ステートフルな watcher とリクエストハンドラの接続にシングルトン設計が必要で、現状より複雑になる。
- **SvelteKit を導入しない（現状維持）**: 却下。手動ルーティングと `package.json` imports の保守コスト、エコシステムとの乖離が増していく。
- **client の `vite.config.ts` を CLI から読む（`configFile` 指定）**: 却下。pnpm の厳格解決により、公開パッケージ内の `vite.config.ts` が依存を解決できない。

## Consequences

- `index.html` と `main.ts` が消え、`src/app.html` + `src/routes/` に置き換わる。
- `adapter-static` の `fallback: '200.html'` が SPA フォールバックを自動生成し、手動コピーが不要になる。
- `.svelte-kit/` は `.gitignore` に追加する。IDE は初回 Vite コマンド実行後に型を解決する。
- CLI の `@sveltejs/kit` と `@sveltejs/adapter-static` は `dependencies`、client の `@sveltejs/kit` は `devDependencies` に配置する。
- ADR-0001（SvelteKit 不使用）と ADR-0006（subpath imports）は本決定により superseded となる。
