# 公開形態の検証はテスト層ではなく1つの自己完結したタスクに置く

公開形態（両パッケージを pack し、空のプロジェクトに実インストールしたもの）の検証を `verify:package` という単一の `vp run` タスクに置く。**テスト層にはしない。** CI が変更ごとに、`prepublishOnly` が出荷の瞬間に、同じタスクを起動する。これに伴い integration 層（`test/*.test.ts`）を廃止し、4層を3層にする。

## 動機

ADR-0020 は issue [#38](https://github.com/yuheiy/note-first-presenter/issues/38) の「壊れる」方を直したが、**壊れ方を検知する層は作らなかった**（0020 の末尾がそう明記している）。#38 自身が「どの案を採っても、`npm pack` した tarball を隔離ディレクトリに実インストールして bin を起動する層が無いと同じ穴を再び掘る」と書いており、この判断は配信方式とは独立に生き残る。だから ADR を分けた。

穴の形は 0020 が記録している通りである。pnpm workspace では `node_modules/note-first-presenter` がシンボリックリンクで、Node は実体パスに解決する。**公開形態を踏む層が1つも無かった**ので、`npm i` した瞬間に最初の一歩で落ちる CLI が、4層すべてと `demo` と `e2e/fixtures/*` を通り抜けていた。

この層の費用対効果は先に実証されている。ADR-0020 の作業でこの手順を手で1回踏んだところ、**テスト層では原理的に見えない実バグが3件**出た（catalog の別名が公開マニフェストに焼き付く / `prepublishOnly` が pack で走らず dist の無い tarball が出る / クリーン clone で demo の dev が死ぬ）。本 ADR の作業でもさらに1件出た（後述の `cacheDir`）。

## テスト層にしない理由

ADR-0005 は「層はファイル名と位置で一意に決まる」と決めており、5番目を足すならそこに名前が要る。しかし**これはテストではない**。パッケージを pack し、レジストリを経由しない tarball から実インストールし、サーバを起動して落とす — 対象はコードではなくリポジトリの出荷物であり、`*.test.ts` という鍵が意味を持つ範囲の外にある。

実務上の帰結も逆を向いている。テスト層にすれば `vp run test` が毎回これを引く。走らせたい頻度は「変更ごと」であって「テストを走らせるたび」ではない。

## ゲートが主張すること、しないこと

3つだけである。

- インストール済みの CLI で `build` が完走し、`dist/index.html` と `dist/nfp-data/meta.json`（`kind: 'resolved'`）が出る
- `export` が完走し、`export/index.html` が出る
- `dev` が起動し、`/nfp-data/meta.json` が `kind: 'resolved'` を返す

**成果物の中身は主張しない。** 404.html が index.html のコピーであることも、設定した eta テンプレートが効くことも、ワークスペースの中と外で**同じ理由で通り、同じ理由で落ちる**。ゲートに載せれば、それらの退行が publish 直前まで — CI がある今なら PR まで — 見えなくなる。配信固有でない主張は、変更ごとに走る速い層が持つべきである。

Slidev の smoke（`.github/workflows/smoke.yml`）が同じ形をしている。`pnpm build` は exit code しか見ず、Cypress の `smoke.spec.ts` は全ケースが `it('should throw no error in ... mode')` で、**リポジトリ全体に build 成果物の中身を検証する層が1つも無い**。厚い assertion は `cy:fixture`（ワークスペース内の dev サーバ）と `vitest` の純関数側にある。

**ただし `dev` は起動する。ここは Slidev と同じで handoff の当初案と違う。** `resolveClientRoot()` が返す client の実体ディレクトリがそのまま Vite の `root` になるので（`vite/index.ts`）、ワークスペースでは `packages/client`、実インストールでは `node_modules/@note-first-presenter/client` — pnpm なら仮想ストアの中 — になる。この差が危険度を持つのは `dev` だけである。`/nfp-data/*` の connect middleware は dev にしか存在しない経路で、`build` は同じデータをファイルとして書き出す別コードだから、そこが壊れても build は緑のままになる。`GET /` では足りない: Vite の SPA フォールバックが middleware の死んだ状態でも 200 を返す。

**型解決は見ない。** 公開 API は `defineConfig` 1つで、リポジトリ内に利用箇所も設定ファイルの実例も1つも無い。加えて `package.json` の `exports` は tsdown の生成物であり、`types` 条件を手で足しても次のビルドで消える（実測）。守る対象が現れてから足せばよい。

**global install も見ない。** Slidev は smoke で試しているが、あちらは `isInstalledGlobally` が依存解決・`optimizeDeps`・`cacheDir` の全域に分岐として走っている（`node/vite/extendConfig.ts`、`node/resolver.ts`）。nfp にそれは無く、README に導入手順も無い。**まだ設計していない経路をゲートが検証する**のは倒錯である。加えて `prepublishOnly` から開発者のグローバル環境を書き換えることになる。

## トリガーを2つ持つ

`verify:package` はトリガーを知らない自己完結したタスクで、呼ぶ側が2つある。

- **CI が push / PR ごとに。** 配信固有の壊れ方は publish 直前に知りたいことではない。ADR-0020 の3件はいずれも PR の時点で知りたかったものである。
- **`prepublishOnly` が publish の瞬間に。** CI が保証するのは「そのコミットは良かった」であって「今 npm に送ろうとしている実物が良い」ではない。両者はタグの切り直し、ワークフローの変更、`main` 以外からのリリースで乖離する。

**将来リリースが CI に移っても `prepublishOnly` は落とさない。** 根拠は npm publish が不可逆であることの一点で、CI の有無ではない。リリースワークフローに「ゲートを走らせる step」を明示的に置く形も可能だが、それは**人が消せる step** であり、`prepublishOnly` は publish というアクションそのものに縛られている。同じ選び分けをこのリポジトリは既に2回している — ADR-0020 が `prepack` と `prepublishOnly` を「どちらのアクションに縛るか」で選んだこと、`deps.onlyBundle` が「`CLAUDE.md` が人間に手で守らせていたものに機械を付けた」こと。

Slidev は逆を選んでいる（`release.yml` はタグ push で `pnpm -r publish` を叩くだけで、smoke とは `needs:` でも `workflow_run:` でも繋がっておらず、`--no-git-checks` まで付く。publish を守っているのはタグを切った人間の判断である）。移植しないのは、**Slidev がゲートを再実行しない理由の大半が 8 レグ + Cypress という値段にあり、nfp の 1 レグ 1〜2 分には当てはまらない**ため。もう1つ、Slidev の実質的な安全網は CI ではなく利用者であり、nfp にはそれが無い。

## 作業ツリーを汚してはならない

Slidev の `scripts/pack.mjs` は pack 前に各 `package.json` のワークスペース依存を `file:` に書き換えて復元しない。使い捨て CI チェックアウトだから成立する手で、**開発者のマシンで走る `prepublishOnly` では、書き換えた `package.json` のまま publish する事故になる。**

書き換えは要らない。CLI が `@note-first-presenter/client` を `peerDependencies` に持つので、隔離ディレクトリで tarball を2本とも明示インストールすれば peer が満たされる（`workspace:` は `"0.0.0"` に解決される）。レジストリアクセスも不要。この根拠は ADR-0013 に追記済みである。

**再帰しない。** `pnpm pack` は `prepack` と `prepare` を発火するが `prepublishOnly` は発火しない（4フック全部をログするプローブパッケージで実測）。だからゲート自身が `prepublishOnly` から呼ばれていても、その中で pack して安全である。副次的に、`prepack` が CLI の dist を、`prepare` が client の paraglide 出力を作るので、**ゲートはどちらの手順も知らないまま完全な tarball を得る**。

**一時ディレクトリはリポジトリの外でなければならない。** pnpm はワークスペースを探して上位を辿るので、このリポジトリの下に作ったプロジェクトはメンバーとして採用され、`workspace:` が再び解決してしまう。隔離が消えたことは何のエラーも出さず、すべて緑のまま通る。

**`dev` に渡すポートは空きを確認してから決める。** Vite は指定ポートが使用中だと黙って次の番号に移るので、固定ポートを polling する実装は「公開 CLI が壊れている」という誤った診断を返しうる。

## integration 層の9ケースの行き先

| ケース                                                  | 行き先                                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| build: SPA shell と 404 コピー                          | **e2e `static`**。`dist/404.html` をファイルとして読む（HTTP 越しには到達できない — `vite preview` が自分で index.html にフォールバックする） |
| build: `nfp-data` の meta/db/slides                     | 移設不要。e2e が `meta.json` の `kind` とスライド画像の表示を既に見ている                                                                     |
| export: 組み込みテンプレート / 設定テンプレート → `.md` | **unit**。`exportAsPage` を `withTempCwd` の中で直接呼ぶ                                                                                      |
| export: 画像が隣に出る                                  | 移設不要。`slides.test.ts` の `renderAll` が `0001.webp` の `size > 0` まで既にカバーしている                                                 |
| config: 未知キー拒否                                    | 移設不要。`src/__tests__/config.test.ts` に既存                                                                                               |
| config: routerMode の値検証 / 拡張子拒否                | **unit**。同ファイルに2ケース追加                                                                                                             |
| config: `dev` の fail-fast                              | **unit**。下記                                                                                                                                |

**9ケースのうち2つは既存の unit と完全に重複していた。** 子プロセスで bin を起動する層は、それ自体が高いだけでなく、何を主張しているのかが曖昧になりやすい。

export の2ケースを純関数の seam に落とさなかったのは、**それらが主張しているのが「eta が動く」ではなく「config の `template` / `filename` が出力に効く」だから**である。その経路は `exportAsPage` にあり、その下のどの純関数にも無い。

## `dev` の fail-fast は型ではなくファイル分割で守る

守りたいのは「`loadNfpConfig` が `dev()` より**前**に来る」という**文の順序**である。壊れたときの症状はエラーではない — サーバが立ち上がり、黙って既定値の routerMode でデッキを配る。旧テストのコメントが「exit code だけ見て一度これで間違えた」と記録している通り、殺されたプロセスは 143 を返すので `status > 0` は壊れた世界でも成り立つ。

**型で構造的に担保する案は退けた。** `dev()` の引数を「検証済みを表す型」にしても、`resolveRouteOptions(args, null)` と書けば設定を一度も読まずに同じ型が作れる（`config` は `NoteFirstPresenterConfig | null` という構造型で、`null` は自由に作れる）。本当に縛るには `loadNfpConfig` の戻り値を `unique symbol` で nominal に包む必要があり、`NoteFirstPresenterConfig` は `defineConfig` の引数として公開 API なので、ブランドが `dist/index.d.mts` に漏れない位置を選ぶ手当ても要る。**1つの性質に対して重すぎるうえ、それでも順序そのものは言わない。**

代わりに `cli.ts` を「`await runMain(main)` の1行」と `commands/index.ts`（コマンド定義）に割った。`cli.ts` の末尾のトップレベル実行が、このテストを妨げていた唯一の障害だった。テストは `vi.mock('../dev.ts')` した上で `dev.run()` を不正な config の temp cwd で呼び、**throw することとモックが一度も呼ばれていないこと**を assert する。これは順序そのものの assertion で、順序を反転させると落ちることを確認してある。`pack.entry` は `src/cli.ts` のままでよい。

## Consequences

- **4層 → 3層。** `test/` が消える。ADR-0005 のタイトルにある「4層構成」だけが取り消され、「層をファイル名と位置で一意に決める」は生きる — `test/` という「位置で決まる層」が消えたことで、鍵はむしろ接尾辞だけに純化する。0005 は supersede せず部分更新にとどめる（ADR-0014 が 0017 に対して採った作法）。0005 の追記 (a)(c) を指しているコードコメント3本（`playwright.config.ts`、`packages/client/vite.config.ts`、`e2e/static/shell.e2e.ts`）は browser / e2e 層の話で、本 ADR は触らない。
- **テスト数**: unit 241 → 246、integration 9 → 0、e2e 20 → 21。
- **ゲートが1件見つけた。** `dev` の Vite `cacheDir` が既定で `<root>/node_modules/.vite` に解決され、`root` は実インストールでは他人のパッケージディレクトリになる。ADR-0016 が「`clientRoot` にコード生成しない」と決めた際に挙げた失敗様態（read-only FS、`pnpm install` で消える）とそのまま同じで、**書いてある規則を Vite の既定値がすり抜けていた**。0016 に追記し、`cacheDir` をプロジェクト側（`node_modules/.note-first-presenter/vite`、`slides/pdf.ts` と同じ根）へ移した。検証層が無いと自分で書いた原則の違反にも気づけない、というのがこの ADR の動機の最短の実例である。
- **実行時間はローカル 17 秒**（pack 4.8 / install 7.0 / build 6.1 / export 0.8 / dev 1.3、pnpm ストア温）。CI は冷えたストアから 139 パッケージを引くので 1〜2 分。ADR-0005 の追記 (c) にある「約60秒」は Playwright の setup project 全体の話で、`build` 単体ではない。
- **`prepublishOnly` が publish 時に vite-plus を要求する。** `vp run -w verify:package` なので、素の `npm publish` では失敗する。**それは正しい失敗**（ゲート無しでは publish させない）だが、将来のリリースワークフローは `voidzero-dev/setup-vp` を通す必要がある。
- **fixture は `scripts/fixture/slides.pdf`**（`test/fixtures/sample.pdf` の移動）。プロジェクトの残り（`.note-first-presenter.json`）はスクリプトが文字列で書き出す。`knip.json` の root workspace の `entry` は `test/**/*.test.ts` から `scripts/*.ts` に置き換わる。
- **`vp run test` は `test:unit && test:e2e` になり、root の `vite.config.ts` から `test.include` と `test:integration` が消える。** ゲートは `dependsOn` を宣言しない — 自分で pack し、pack が `prepack` を発火するので、ビルドは測定対象そのものによって保証される。タスクキャッシュに「成果物は最新だ」と教えてもらうゲートは、まさに自分が確かめるべき一点を他人に委ねることになる。`cache: false` も同じ理由による。

## Considered Options

- **ゲートを起動スモーク（`--version` が返るだけ）にとどめる**: 却下。ADR-0020 の3件のうち `--version` で捕まるのは1件だけで、残りは pack と install を経ないと出ない。
- **成果物の中身の assertion をゲートに吸収する（handoff の当初案）**: 却下。配信固有でない主張の退行が、変更ごとの層から publish 前後まで遅れる。§ゲートが主張すること参照。
- **ゲートを `vp run test` にも組み込む**: 却下。ADR-0005 が整理して殺した「無規約な第3形態」の再来になる。
- **`{OS} × {パッケージマネージャ} × {hoist 有無}` のマトリクス**: 採らない。Slidev は 8 レグ張っているが、nfp が OS 固有で踏む可能性のある箇所として特定できているのは `node --watch-path`（demo の dev スクリプト1行、ビルドもテストも公開物も踏まない、ADR-0020）だけである。必要が判明してから足せばよい。
- **tsnapi 相当の公開 API スナップショット**: 採らない。Slidev は `test/api-snapshots.test.ts` でワークスペース側に持っている（対象は `types` と `parser` のみで、CLI は対象外）。これは配信固有ではないので、入れるならワークスペースの unit 層であり、本 ADR が作る穴でもない。
