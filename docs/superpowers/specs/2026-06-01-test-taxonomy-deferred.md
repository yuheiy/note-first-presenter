# テスト層の再設計 — 保留作業（Task 5 / 6）

- 日付: 2026-06-01（記録）／ 2026-06-02（解消）
- 関連: `docs/superpowers/specs/2026-06-01-test-taxonomy-design.md`、`docs/superpowers/plans/2026-06-01-test-taxonomy.md`
- ステータス: **解消（2026-06-02）**。0.1.23 のまま browser orchestrator のハングが再現しなくなり、Task 5 / Task 6 を実施して component 層 4 ファイル / 5 件を本体に取り込んだ。

## 解消ノート（2026-06-02）

vite-plus 0.1.24 へのバンプ検証中に、`packages/client/vitest.browser.config.ts` を立てて `vp test -c vitest.browser.config.ts` を直叩きしたところ、**0.1.23 のままで Chromium ヘッドレスが起動して component テストが緑になった**（`@voidzero-dev/vite-plus-test@0.1.23` のまま再現せず）。インストール済みパッケージの ID は同じだが、catalog 経由で取得した実体に upstream の修正が反映された可能性が高い。

0.1.24 では別途 TypeScript 型の regression（`InlineConfig` / `PluginOption` の Excessive stack depth、`packages/note-first-presenter/src/vite/index.ts` の `paraglideVitePlugin` 周辺で 3 件）が確認されたため、バンプは見送り 0.1.23 のまま component 層を有効化した。

## 当時の概要（参考）

仕様で定義した 4 層のうち **component 層（vitest browser モード）が実装不能と判明**したため、Task 5（component config + R2 スモーク）と Task 6（残り leaf component 3 件）を本 PR から外した。他のすべてのタスク（1〜4、7〜12）は予定どおり実施し、4 層中 3 層（unit / cli-integration / e2e）を整備した。

## R2 の根本原因（当時）

`@voidzero-dev/vite-plus-test`（vite-plus 0.1.23 が依存する内部実装）の browser orchestrator が、worker module graph の分離下で正しく動作しない。具体的には:

1. Playwright Chromium は正常に起動する（外部の `node -e ...` で 1 秒で launch + close 可能、確認済み）
2. Vitest browser API server（`localhost:<port>/__vitest_browser_api__`）は起動する
3. tester iframe は WebSocket で接続する
4. orchestrator スクリプト・test runner スクリプトはロードされる
5. **しかし tester WS の URL に `?method=none` が固定で付与され、`method=run` への遷移が起きない**
6. → テストランナーが永続待機、テスト本体は実行されない

これは Task 1 で先に判明した R1（`vite-plus/test` shim と worker module graph の `runner` global 不整合）と同根の問題で、browser モードでは `@voidzero-dev/vite-plus-test` がさらに `@vitest/browser` を自前 dist 配下に再バンドルしているため、host 側 vitest と browser orchestrator 側 vitest のあいだで RPC ハンドシェイクが噛み合っていないと推測される。

`vp test` ラッパだけの問題ではない（直接 `node node_modules/.pnpm/vitest@.../vitest/dist/cli.js run -c vitest.browser.config.ts ...` でも再現）。

## 試行と結果

すべて `packages/client/` から実行。

| 試行                                                                                                      | 結果                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `vp test -c vitest.browser.config.ts`（svelte plugin あり、`SlideListErrorOverlay.browser.test.ts` 1 件） | RUN ヘッダのみ出力、4 分以上ハング                                                                |
| `vp test -c vitest.browser.config.ts`（svelte plugin あり、`minimal.browser.test.ts` 1 件・空のスモーク） | 同上                                                                                              |
| `vp test -c vitest.browser.config.ts`（svelte plugin なし、`minimal.browser.test.ts` 1 件）               | 同上                                                                                              |
| 直接 `node vitest/dist/cli.js run -c vitest.browser.config.ts ...`                                        | `RUN v4.1.7` 表示、その後ハング                                                                   |
| 同上 + `DEBUG='vitest:*,vite:browser,pw:*'`                                                               | Chromium 起動成功、iframe ロード成功、tester WS 接続成功、`method=none` で停止、ping 送信のみ継続 |
| 別ノードプロセスで `chromium.launch({ headless: true })` 単体                                             | 1 秒で launch / close 成功                                                                        |

## 再開手順（upstream 修正後）

`vite-plus` の `@voidzero-dev/vite-plus-test` パッケージで browser orchestrator が修正されたら、以下を順に実施:

1. **依存更新**: `vp install`（catalog 経由で vite-plus 一式が上がる）後、本 doc の試行を再実行して `method=run` への遷移が起きることを確認。
2. **`packages/client/vitest.browser.config.ts` を再作成**:

   ```ts
   import { svelte } from '@sveltejs/vite-plugin-svelte';
   import { playwright } from 'vite-plus/test/browser-playwright';
   import { defineConfig } from 'vite-plus';

   export default defineConfig({
     plugins: [svelte()],
     test: {
       include: ['src/**/__tests__/*.browser.test.ts'],
       browser: {
         enabled: true,
         provider: playwright(),
         instances: [{ browser: 'chromium' }],
         headless: true,
       },
     },
   });
   ```

3. **`packages/client/package.json` の `test` スクリプトを直列化**:

   ```json
   "test": "vp test && vp test -c vitest.browser.config.ts"
   ```

4. **Task 5 のスモーク `SlideListErrorOverlay.browser.test.ts` を再作成**（plan の Task 5 Step 3 のコード片）。
5. **Task 6 の残り 3 ファイルを実装**:
   - `SlideListHint.browser.test.ts`
   - `SlideshowFallback.browser.test.ts`
   - `SlideImage.browser.test.ts`（`__NFP_STATIC__` をスタブして dev mode の `/api/slide/{hash}/{n}` 解決を検証）

   仕様セクション 4-3 と plan の Task 5・Task 6 の本文（component テストのコード片を含む）が source of truth。

6. **CLAUDE.md の Testing layers セクションに browser 層を追記**（現状は unit / cli-integration / e2e の 3 層のみ列挙してある。`**/__tests__/*.browser.test.ts — component (vitest browser, Chromium)` の行を追加する）。

7. **集計表の合算更新**（component +4 ファイル、合計 +4 ファイル）。

## 再開の代替経路（upstream 修正が長期化した場合）

仕様 R2 のフォールバックとして次の選択肢が存在する。本 PR では採用しなかったが、当該経路で先に進める場合の指針:

- **B-path（lint rule override + bare `vitest` import）**: `packages/client/src/**/__tests__/*.browser.test.ts` だけ `from 'vitest'` を許可する lint override をルート `vite.config.ts` に追加し、`vitest-browser-svelte` 経由で raw vitest を使う。同じ `method=none` 問題が `@voidzero-dev/vite-plus-test` のオリジネーター側から発生するかは未検証で、検証 1〜2 時間が見込まれる。

## 影響

- 仕様セクション 4-3（leaf component テスト 4 件）と 8 集計表（component 4 ファイル）は **保留扱い**。実装後に追記して合算する。
- 仕様セクション 5.5 と Task 9・Task 10 の判定は影響を受けない（unit と e2e の責務分担は変わらず、component 層が遅れて入ることで補強される構造）。
- e2e の縮減（Task 9）は予定どおり実施する。component が後追いになっても、e2e は当該キーマップ / UA 判定のみ残す方針で問題ない（仕様セクション 5.5-A の判定根拠は component の有無に依存しない）。
