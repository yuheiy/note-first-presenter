# テストは4層構成とし、層をファイル名で一意に決める

> **Note (ADR 0010 により部分更新)**: CLI をソース配信に切り替えたため、integration 層の検証対象は **packed bin から source-bin** に変わり、`test:integration` の前段ビルド（`vp run note-first-presenter#build`）は不要になった。4層構成・root 配置・ファイル名キーという本 ADR の中核判断は存続する。

vitest/Playwright の2層構成では境界が曖昧で、無規約な第3形態（`*-integration.test.ts`）が実 CLI を起動して `vp test` のフィードバックを遅らせていた。これを4層に整理する: server/unit（`**/*.test.ts`、Node）、client（`**/*.svelte.test.ts`、vitest browser/Chromium）、cli-integration（`test/*.test.ts`、packed bin を起動）、e2e（`e2e/*.e2e.ts`、Playwright）。**層はファイル名だけで判定**し、重い CLI 統合層をデフォルトの `vp test` から分離する。

CLI integration と e2e はいずれもパッケージ横断の結合テストであり（CLI の `build` コマンドは内部で client の SPA をバンドルする）、ルート直下に配置する（`test/`・`e2e/`）。パッケージ内に置かない理由は、テストのスコープがパッケージ単体ではなくリポジトリ全体にまたがるため。

## Consequences

- client の unit 層は `vite.config.ts` の `test.projects` で `server`（Node）と `client`（vitest browser/Chromium）に分離する。`*.svelte.test.ts` がブラウザ、それ以外が Node。nfp は `test.projects` を使わず `test` に直接定義する。
- integration 層はルートの `vite.config.ts` の `test.include` に直接定義する。テストファイルがルートの `test/` にあるため、設定の所在とファイルの所在を一致させる。
- integration 層はルートの `vp test`（root の `vite.config.ts`、integration のみ）で実行する。~~前提である `vp pack` を `vp run note-first-presenter#build` として事前実行する~~ → ADR 0010 でソース配信に移行したため前段ビルドは廃止。bin は `src/cli.ts` を直接起動する。
- integration テスト内の bin 実行はコマンド名（`note-first-presenter`）で呼ぶ。ルートの devDependencies に `note-first-presenter` を `workspace:*` で追加し、`node_modules/.bin/` にシンボリックリンクを張る。パッケージ内部のファイルパスへの依存を排除する。
- e2e は Playwright（Vitest 外）なので projects には含めず、`vp run test:e2e` で別途実行する。`playwright.config.ts` はルート直下に置く。
- tsconfig はルートの `tsconfig.json` に `"types": ["node"]` を置き、`test/` と `e2e/` の型解決を統一する。各パッケージは独自の tsconfig で型空間を管理する。
- fixture は各層の直下に置く（`test/fixtures/`、`e2e/fixtures/`）。共有 fixture がないため、帰属を明示する。
