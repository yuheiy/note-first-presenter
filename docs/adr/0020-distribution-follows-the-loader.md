# 配信方式はパッケージではなくロードするランタイムが決める

Supersedes: ADR-0010

CLI は `vp pack` で `dist/` にビルドしてから配信し、client は `src/` の `.ts` を無ビルドで配信する。この**非対称は不整合ではなく、それぞれをロードするのが誰かの違いである** — CLI を読むのは Node、client を読むのは CLI が `root: clientRoot` で起動する Vite（自分で変換する）。

## 動機

Node は `node_modules` 配下の `.ts` を型ストリップしない（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`、仕様でありフラグの逃げ道なし）。つまり ADR-0010 の「`.ts` のまま配信」は**公開パッケージとしてインストールされた瞬間に最初の一歩で落ちる**（#38）。pnpm workspace ではシンボリックリンクの実体が `node_modules` の外なので制約に当たらず、ローカル開発も全テスト層も通ってしまい、壊れ方を誰も見なかった。

## Considered Options

- **公開を諦め `private: true` にする**: 却下。実際に選べたが、#38 が要求しているものより大きい決定。
- **client も dist 配信に揃える**: 却下。client は Vite の `root`（`index.html`、CSS エントリ、生成物込み）であってライブラリビルドの対象になる形をしていない。

## Consequences

- **`dbSchema` だけは CLI の `dist/` に焼き込む**（`deps.alwaysBundle`）。client のソースでありながら**読むのが Node** という唯一の越境。external のまま残すと #38 が再現する。ADR-0013 の「client が単一定義を所有」はソースの所有についての主張で、生成物にコピーが入ることと矛盾しない。
- **`deps.onlyBundle: []` を張る。** 未宣言 import を絶対パスで焼き込んで publish 不能にする罠が、これで**ビルドが止まる**ようになった。「ランタイム依存は全部 `dependencies` に宣言する」規則に機械が付いた形。空リストなのは「node_modules から焼き込まれるものは1つも無い」というのがまさに主張したいことだから。**失敗は「whitelist に足せ」ではなく「宣言しろ」と読むこと。**
- **`vite` は catalog ではなく実 `vite` の範囲で宣言する。** catalog は `vite` を `npm:@voidzero-dev/vite-plus-core` に別名解決しており、`catalog:` のままだと別名が公開マニフェストに焼き付く。vite-plus-core は実行時に `vite-plus` のネイティブバインディングを要求するのに宣言していないため、公開ユーザーの環境では CLI が最初の一歩で落ちる（#38 と独立の、publish を阻む第二の障害だった）。ローカルの解決は `overrides` が引き続き vite-plus-core に寄せるので開発・テストは不変。両者の入れ替え可能性は、隔離環境の `build` 成果物のチャンクハッシュ完全一致で確認済み。
- **ビルドのフックは `prepack` であって `prepublishOnly` ではない。** `prepublishOnly` は publish でしか走らないので、`pnpm pack` が `dist/` の入っていない tarball を成功として出し、`verify:package`（ADR-0021）が誤った診断を返す。
- **e2e と `verify:package` は `dist/` を対象にする**（PATH の bin が `dist/cli.mjs` を読む）。publish を待たずに出荷物を走らせる層が日常的に存在する — #38 を生んだ穴の裏返し。
- 開発ループは2プロセス（CLI は `vp pack --watch`、demo は `node --watch-path` で再起動。制約と理由は `demo/vite.config.ts` のコメントが正本）。client 側の編集は今まで通り HMR。
- ADR-0010 のソース側の制約（`erasableSyntaxOnly` / 明示 `.ts` 拡張子 / `module: nodenext`）は残すが、もはや必須ではない。外す実益が無く戻す差分だけが大きいから残すだけで、将来外すのは自由。
- `engines >=22.18.0` は型ストリップではなく依存（vite × pdfjs-dist）の積。bin が `.mjs` スタブなのは、ビルド前にも存在するパスを `bin` が指す必要があるため。
