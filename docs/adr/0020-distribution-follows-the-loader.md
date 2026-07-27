# 配信方式はパッケージではなくロードするランタイムが決める

Supersedes: ADR-0010

CLI は `vp pack` で `dist/` にビルドしてから配信し、client は `src/` の `.ts` を無ビルドで配信する。この**非対称は不整合ではなく、それぞれをロードするのが誰かの違いである** — CLI を読むのは Node、client を読むのは Vite。ADR-0010 は「同じモノレポで方式が違うのは不一致だ」として CLI 側を client に揃えたが、揃える軸そのものを間違えていた。

## 動機

Node は `node_modules` 配下の `.ts` を型ストリップしない（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。これは仕様であり、フラグでの回避手段は用意されていない。したがって ADR-0010 の「`.ts` のまま配信する」は、**公開パッケージとしてインストールされた瞬間に最初の一歩で落ちる**（issue #38）。

pnpm workspace ではこれが見えない。`node_modules/note-first-presenter` はシンボリックリンクで、Node は既定で実体パス（`packages/note-first-presenter/...`）に解決する。実体は `node_modules` の外なので制約に当たらない。ローカル開発も、当時の4層のテストも、`demo` も `e2e/fixtures/*` も全部通る。**公開形態を踏む層が1つも無かった**ので、壊れ方を誰も見なかった。

制約が Node のものである以上、これは client には及ばない。client の `.ts` を読むのは CLI が `root: clientRoot` で起動する Vite であり、Vite は自分で変換する。**同じ `.ts` が、誰に読ませるかで配信可能かどうかが変わる。**

## Considered Options

- **`--experimental-strip-types` 相当のフラグで回避する**: 却下（というより不在）。このエラーは意図的な設計で、逃げ道が用意されていない。
- **公開を諦め `private: true` のワークスペース専用ツールにする**: 却下。`version: 0.0.0` で未公開なので実際に選べる選択肢だったが、公開する意図を捨てる決定であり、#38 が要求しているものより大きい。
- **client も何らかのビルドを挟んで dist 配信に揃える**: 却下。揃うのは見た目だけで、client は Vite の `root`（`index.html`、Tailwind の CSS エントリ、paraglide の生成物込み）であって、ライブラリビルドの対象になる形をしていない。何を `dist` に出すのかから設計が必要になる。
- **ADR-0010 に追記する**: 却下。0010 のタイトルの主張「`vp pack` せず `.ts` のまま配信する」そのものが撤回されるので、追記だと見出しが状態と矛盾する。

## Consequences

- **`dbSchema` だけは CLI の `dist/` に焼き込む**（`deps.alwaysBundle`）。ADR-0013 で client が所有することにしたこの1ファイルは、client のソースでありながら**読むのが Node**という唯一の越境である。external のまま残すと、公開ユーザーの Node が `node_modules` 配下の `.ts` を掴むという #38 そのものが再現する。ADR-0013 の「client が単一定義を所有する」はソースの所有についての主張であり、生成物にコピーが入ることと矛盾しない。matcher は正規表現でなければならない — 文字列 `'@note-first-presenter/client'` は subpath 付きの specifier に一致せず、external のまま素通りする。
- **`deps.onlyBundle: []` を張る。** ADR-0010 が「`vp pack` の罠」として挙げた、未宣言 import を絶対パスで焼き込んで publish 不能にする問題は、これで**ビルドが止まる**ようになった（specifier と import 元を名指しする）。`CLAUDE.md` が人間に手で守らせていた「ランタイム依存は全部 `dependencies` に宣言する」に、機械が付いた。空リストなのは、`alwaysBundle` の対象がワークスペースのシンボリックリンク経由で来て node_modules 扱いされないため — node_modules から焼き込まれるものは1つも無い、というのがまさに主張したいことである。
- **公開 API の型は client 境界を越えない。** `dist/index.d.mts` に現れるのは `defineConfig` と config スキーマだけで、`DbV1` は出てこない。したがって `deps.dts` 側に同じ指定は要らない（要るようになったら、そのとき足せばよい）。
- **integration と e2e は `dist/` を対象にする。** どちらも PATH の `note-first-presenter` を叩き、その bin は `dist/cli.mjs` を読む。`vp run` の `dependsOn` でビルドを前段に宣言した。副次的に、**publish を待たずに出荷物を走らせる層が日常的に存在する**ようになった — #38 を生んだ穴の裏返しである。
- **開発ループが2プロセスになる。** CLI は `vp pack --watch`、demo は `node --watch-path=<CLI の dist>` が変化を見て再起動する。client 側の編集は今まで通り HMR で即反映される（Vite が読んでいるので、そもそもビルドを挟まない）。
  - **`--watch-path` は macOS と Windows でしか動かない。** Node の watch mode は再帰監視が要るかどうかで実装を分けているが（`supportsRecursiveWatching = win32 || darwin`）、その分岐を通るのは `--watch` の module-filter 経路だけで、`--watch-path` は recursive 固定で `fs.watch` を呼ぶ。Linux では `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` で即死する。**これは demo の開発スクリプト1行だけの制約**で、ビルドもテストも公開物も踏まない。nodemon を1つ足せば移植性は買えるが、`dist` だけを見るという同じ精度を組み込みで得られるので依存を選ばなかった。素の `--watch`（パス無し）なら Linux でも動くが、ロード済みモジュールを全部監視する — CLI は Vite と pdfjs を読むので、監視対象が目的に対して大きすぎる。
  - demo が `note-first-presenter` ではなく bin の実パスを名指しするのはこのため。`node --watch-path` は実行対象がスクリプトパスでなければならず、pnpm の `node_modules/.bin/*` はシンボリックリンクではなくシェルシムなので node からは実行できない。
- **ADR-0010 のソース側の制約（`erasableSyntaxOnly` / 相対 import の明示 `.ts` 拡張子 / `module: nodenext`）は残すが、もはや必須ではない。** Node がこのソースを型ストリップする経路は無くなった。残すのは、外す実益が無く戻す差分だけが大きいからであって、規約として守るべきものだからではない。将来これらを外すのは自由である。
- **`engines` は `>=22.18.0` のまま。** これは型ストリップの要求ではなく、依存の要求だった — `vite` が `^20.19.0 || ^22.18.0 || >=24.11.0`、`pdfjs-dist` が `>=22.13.0 || >=24` で、積が `^22.18.0 || >=24.11.0` になる。ビルドを戻しても下がらない。
- **bin は `.mjs` のスタブのまま。** ただし理由が変わった。以前は型ストリップの `ExperimentalWarning` を最初の `.ts` より前に握り潰すためだったが、その警告ごと消えた。今の理由は `bin` がビルド前にも存在するパスを指す必要があることだけで、中身は `dist/cli.mjs` への転送1行になった。
- **公開形態を踏む検証はまだ無い。** #38 が「どの案を採っても要る」と書いた層はこの ADR では作らない。配信方式とは独立に生き残る判断なので別の ADR が引き取る。
