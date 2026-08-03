# テスト層はファイル名で一意に決める

無規約な第3形態（`*-integration.test.ts` が実 CLI を起動して `vp test` を遅らせる、等）の増殖を防ぐため、**テスト層はファイル名だけで判定**する。設定を読まなくても、ファイル名を見れば層と実行環境が分かる。

| 層      | 鍵                                   | 実行環境                              |
| ------- | ------------------------------------ | ------------------------------------- |
| node    | `**/*.test.ts`（`.browser.` を除く） | Node                                  |
| browser | `**/*.browser.test.{ts,tsx}`         | vitest browser（実 Chromium）         |
| e2e     | `e2e/**/*.e2e.ts`                    | Playwright（ビルド済み `dist/` 相手） |

- **拡張子キー（`*.test.tsx` → browser）は退けた。** browser 行きの実際の理由は JSX ではなく DOM API（`DOMParser` 等）であることが多く、その相関に層の判定を賭けられない。
- **jsdom / happy-dom は使わない。** DOM を触るテストは実 Chromium へ。`BroadcastChannel` は Node のグローバルにあるので sync 系は node のままでよい。
- e2e はパッケージ横断（CLI の `build` が client をバンドルする）なのでルート直下 `e2e/` に置く。Playwright の project で dev サーバ系と静的成果物系を分け、静的系は setup project が build を担うため dev 系だけの実行では build が走らない。
- client の vitest project 名は実行場所どおり `node` / `browser`。

当初は「packed bin を起動する integration 層」を含む4層だった。integration 層は ADR-0021 が廃止し、その「実 CLI を叩く」役割は `verify:package` タスク（テスト層ではない）が引き取った。
