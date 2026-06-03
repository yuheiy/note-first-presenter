# テストは4層構成とし、層をファイル名で一意に決める

vitest/Playwright の2層構成では境界が曖昧で、無規約な第3形態（`*-integration.test.ts`）が実 CLI を起動して `vp test` のフィードバックを遅らせていた。これを4層に整理する: unit（`**/__tests__/*.test.ts`、Node/happy-dom）、component（`**/__tests__/*.browser.test.ts`、vitest browser/Chromium）、cli-integration（`packages/note-first-presenter/test/cli/*.cli.test.ts`、packed bin を起動）、e2e（`e2e/*.e2e.ts`、Playwright）。**層はファイル名だけで判定**し、重い CLI 統合層をデフォルトの `vp test` から分離する。

## Consequences

- 各層は各パッケージの `vite.config.ts` の `test.projects` に named project として登録する（client: `unit`/`component`、nfp: `unit`/`cli`）。層ごとに別 config ファイルを持たず、include・環境・`globalSetup` を1ファイルに集約する。
- Vitest には「登録するがデフォルト実行から除外する project」の型安全な仕組みがない（config の `test.project` は型に無く `vp check` を通らない）ため、重い cli 層は nfp の `test` スクリプトで `--project='!cli'` を指定してデフォルトから外し、`vp run test:cli`（`--project=cli`）でのみ起動する。`--project='!cli'` は cli project の `globalSetup`（`vp pack`）ごとスキップする。
- e2e は Playwright（Vitest 外）なので projects には含めず、`vp run test:e2e` で別途実行する。
- `globalSetup` で `vp pack` を1回に集約し、CLI 統合テスト間の二重 pack を避ける。
