# テストは4層構成とし、層をファイル名で一意に決める

vitest/Playwright の2層構成では境界が曖昧で、無規約な第3形態（`*-integration.test.ts`）が実 CLI を起動して `vp test` のフィードバックを遅らせていた。これを4層に整理する: unit（`**/__tests__/*.test.ts`、Node/happy-dom）、component（`**/__tests__/*.browser.test.ts`、vitest browser/Chromium）、cli-integration（`packages/note-first-presenter/test/cli/*.cli.test.ts`、packed bin を起動）、e2e（`e2e/*.e2e.ts`、Playwright）。**層はファイル名だけで判定**し、重い CLI 統合層をデフォルトの `vp test` から分離する。

## Consequences

- 各パッケージの `test` スクリプトは `--project=unit[,component]` を明示する。Vitest には「登録はするがデフォルト実行から除外する project」の仕組みがないため、cli project は `pnpm test:cli`（`--project=cli` 明示）でのみ起動する。
- `globalSetup` で `vp pack` を1回に集約し、CLI 統合テスト間の二重 pack を避ける。
