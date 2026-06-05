# パスエイリアスに Node.js subpath imports を使う

SvelteKit 由来の `$lib` エイリアスを `tsconfig.json` paths と `vite.config.ts` resolve.alias で二重に定義していた。本プロジェクトは SvelteKit を使っていないため（ADR-0001）、Node.js 標準の subpath imports（`package.json` の `"imports"` フィールド、`#lib/*`）に移行し、定義箇所を一本化した。

TypeScript の `moduleResolution: "bundler"` は `package.json` `"imports"` を解決できるが、展開後のパスで拡張子の自動補完を行わない。配列フォールバック `["./src/lib/*", "./src/lib/*.ts", "./src/lib/*.js"]` によって拡張子なしのインポートを維持している。

## Considered Options

- **`tsconfig.json` paths のみ**（Vite は別途 `resolve.alias` が必要で二重管理が残る）
- **`package.json` imports + `tsconfig.json` paths**（Vite の alias は不要になるが定義が2箇所）
- **インポートに拡張子を明示**（配列フォールバック不要だが既存コードと慣習から乖離する）

## Consequences

- nfp パッケージの `createViteConfig`（`configFile: false`）でも `resolve.alias` は不要。Vite は `root` で指定されたパッケージの `package.json` `"imports"` を自動的に解決する。
