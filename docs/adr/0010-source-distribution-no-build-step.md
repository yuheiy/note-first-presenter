# CLI を `vp pack` せず `.ts` ソースのまま配信する

`note-first-presenter`（CLI）は `vp pack` で `dist/` にバンドルしてから配信していたが、同じモノレポの `@note-first-presenter/client` は既に `src/` を無ビルドで配信しており（ADR 0002）、CLI だけがビルドを挟んで配信方式が不一致だった。Node 22.18 で TypeScript の type stripping が unflagged になったため、CLI もビルドステップを撤廃し `src/` の `.ts` をそのまま配信して、client と方式を統一する。副次的に、`vp pack` が未宣言 import を絶対パスで焼き込み publish 不能にする罠（全依存が `node_modules` 解決になることで）も消える。

## Consequences

- 公開 CLI は **Node `>=22.18`** を要求する（`engines` に明記）。
- **相対 import は明示拡張子が必須**（`./config.ts`、ディレクトリは `../vite/index.ts`）。Node は拡張子もディレクトリも補完しない。`tsconfig` は `module: nodenext`（moduleResolution は nodenext に既定。拡張子漏れを TS2835 として型チェック時に検出。`bundler` 解決だと見逃す）+ `allowImportingTsExtensions`（`.ts` 拡張子を許可）。
- **erasable な構文のみ**使用可（enum / namespace 値 / parameter properties / decorators 不可）。`tsconfig` の `erasableSyntaxOnly` で型チェック時に保証する。
- bin は `.mjs` ラッパー（`bin/note-first-presenter.mjs`）を維持し、`src/cli.ts` を動的 import する直前に `process.emitWarning` を差し替えて type stripping の `ExperimentalWarning` を握り潰す。エントリを `.ts` にすると警告が自前コードより前に出て抑止できないため。
- `files` は `bin` + `src`（`__tests__` 除外）を配信。`.d.ts` は生成しない（型ソースは `.ts` 自身）。`exports["."]` は `./src/index.ts`。
- ADR 0005 の integration 層は **packed bin ではなく source-bin** を検証対象とする。`test:integration` から `vp run note-first-presenter#build` の前段が不要になった（ADR 0005 を部分的に supersede）。
