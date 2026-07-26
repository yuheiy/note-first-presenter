# テストは4層構成とし、層をファイル名で一意に決める

> **Note (ADR 0010 により部分更新)**: CLI をソース配信に切り替えたため、integration 層の検証対象は **packed bin から source-bin** に変わり、`test:integration` の前段ビルド（`vp run note-first-presenter#build`）は不要になった。4層構成・root 配置・ファイル名キーという本 ADR の中核判断は存続する。

> **Note (ADR 0014 により部分更新)**: React 書き直しで **鍵の綴り・client の project 名・e2e の project 数**の3点が変わった。詳細は末尾の追記（2026-07-26）を読むこと。中核判断（4層構成・root 配置・ファイル名キー）はここでも存続する。

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

## 追記（2026-07-26）: React 書き直しに伴う3点の変更

client が Svelte から React になり（ADR-0014）、`*.svelte.test.ts` という自然な鍵が消えた。**4層構成・root 配置・ファイル名キーという本 ADR の中核判断は3つとも存続し**、変わったのは以下の3点だけである。

### (a) 鍵の綴りを接尾辞キーに移した

| 層              | 旧                                  | 新                                                |
| --------------- | ----------------------------------- | ------------------------------------------------- |
| **node**        | `**/*.test.ts`（`.svelte.` を除く） | `**/*.test.ts`（`.browser.` を除く）              |
| **browser**     | `**/*.svelte.test.ts`               | `**/*.browser.test.{ts,tsx}`                      |
| **integration** | `test/*.test.ts`                    | 変更なし                                          |
| **e2e**         | `e2e/*.e2e.ts`                      | `e2e/**/*.e2e.ts`（下記 (c) の `static/` のため） |

`adobe/react-spectrum` に倣った形である（あちらは3層すべて接尾辞キーで、`testPathIgnorePatterns` が `\.ssr\.test\.` と `\.browser\.test\.` を除外して既定層を引き算で定義している）。

**拡張子キー（`*.test.tsx` → browser）は退けた。** 「browser 層は必ず JSX を書く」という相関に層の判定を賭けることになるが、**この相関は本リポジトリで既に破れている** — `paste.svelte.test.ts` が browser プロジェクトにいたのは Svelte のせいではなく `plugins/paste.ts` の `new DOMParser().parseFromString(...)` のためだった。`.svelte.` という鍵は**実態を偽っていた**わけで、接尾辞キーなら `paste.browser.test.ts` として素直に収まる。

### (b) client の project 名を `server`/`client` → `node`/`browser` にした

旧名は「client パッケージの client プロジェクト」という入れ子で、しかも書き直し後は `src/lib/server/**` が存在しなくなり `server` は完全な誤称になる。走る場所（Node / 実 Chromium）で名前を付け直した。`vp test --project browser <path>` のように scope する。

**jsdom / happy-dom は使わない。** DOM API を触る Node テストが1本も残らないため（theme の localStorage、listOpen、activeSlide の hash 書き戻しはいずれもテスト対象外に置いた）。`BroadcastChannel` は Node 18+ にグローバルで存在するので sync publisher/subscriber は Node のままである。

### (c) e2e を `dev` / `static` の2 project に分けた

書き直し前の e2e は全て dev サーバに対してで、**静的成果物を実際に開くテストが1本も無かった**。ADR-0014 の hash ルーティングと `/nfp-data/*` への URL 統一により、ここは最も壊れやすい場所になる（dev は middleware が動的に応答し、static は実ファイル配置がすべて）。

- `playwright.config.ts` の `webServer` を配列にして dev(5173) と静的配信(4173) を並立させ、`dev` / `static` の2 project に分ける。`vp run test:e2e` は1コマンドのままで、失敗時に project 名で「dev middleware の問題か静的配信の問題か」が切り分けられる。
- 静的系統は `dist/` を要し build に約60秒かかる（既に `workers: 1` 直列なので体感できる）。**`static-build` を setup project にして `static` の `dependencies` に置く**ことで、`--project=dev` では build 自体が走らない。
- **integration 層に置く案は退けた。** 4層に整理した本 ADR の動機（層の境界を曖昧にしない）に逆行する。別 config 案の唯一の利点（静的系統を回さない選択）は `--project=dev` で得られる。
- ファイルが `e2e/static/` に入るため、Playwright の `testMatch` は据え置きのまま本 ADR の鍵表記だけ `e2e/**/*.e2e.ts` に広がる。

### 併せて: e2e のファイル名を camelCase に揃えた

`live-update.e2e.ts` → `liveUpdate.e2e.ts` / `outliner-range.e2e.ts` → `outlinerRange.e2e.ts` / `slideshow-sync.e2e.ts` → `slideshowSync.e2e.ts`。client 側のファイル名規約（React コンポーネントを export する `.tsx` は PascalCase、それ以外は camelCase）を root の e2e にも及ぼしたもので、**層の判定には影響しない**（Playwright の `testMatch: '**/*.e2e.{ts,js}'` はパターン一致なので改名に非依存）。
