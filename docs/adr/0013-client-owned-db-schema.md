# db のワイヤスキーマを client が所有し、CLI が subpath import する

Supersedes: ADR-0002

`packages/client/src/lib/dbSchema.ts` と `packages/note-first-presenter/src/db.ts` は、valibot 定義（`{ version: literal(1), title: string, outline: unknown }`）もデフォルト値（`defaultDb()` / `emptyDb()`）も1文字違わない二重定義だった。これを **client が単一定義を所有し、`@note-first-presenter/client/dbSchema` として export、CLI が import する**形に改める。ADR-0002 の「ネットワーク境界をまたぐ JSON は client と CLI がそれぞれ自前の型を定義する」を撤回する。

## 動機

「原稿が消えない」の最も静かな壊れ方は、**client が組み立てた PUT ボディをサーバの valibot が拒否する**ことである。`PUT /nfp-data/db.json` が 400 を返すと saver は5秒ごとに永久リトライし、UI は汎用の保存エラー表示だけを出す。ユーザーには「保存できていない」ことしか見えず、原因も箇所も分からない。**この危険は重複そのものが生んでいる**（片方だけを触った編集が、型検査もテストも通ったまま本番の齟齬になる）。

もう一つは所有権の実態である。`emptyDb()` はサーバ側にありながら `bullet_list` / `list_item` / `paragraph` という **ProseMirror のノード名をハードコード**していた。サーバは既に client のドキュメントスキーマを知ってしまっている。封筒と初期ドキュメントは client の領分で、サーバは「JSON をアトミックに読み書きする」だけであるべきなので、所有権の逆転ではなく**既に漏れている方を正す**変更になる。

## なぜ client 所有のスキーマでサーバが untrusted 入力を検証してよいのか

ADR-0002 の Consequences は「PUT は**サーバ自前の** valibot スキーマで入力検証する（信頼境界のガード）」と書いていた。これが最も強い反対論拠なので、信頼境界を言い直しておく。

1. **信頼境界が守っているのは「サーバのファイル I/O」であって「サーバの型定義の出自」ではない。** `readBody` が受け取るのは任意のバイト列であり、`.note-first-presenter.json` に書く前に形を確かめる必要がある——この必要性は検証の**実行場所**（サーバプロセス内、書き込みの直前）に由来する。スキーマがどのパッケージのファイルに書かれているかは、この保証に何も足さない。import 後の `v.safeParse` は自前定義のときと1バイトも違う動作をする。
2. **client のスキーマは「client の内部モデル」ではなく「ワイヤ形式の仕様」である。** `dbSchema.ts` が知っているのは封筒の3フィールドだけで、`outline` は `v.unknown()` のまま——ProseMirror のドキュメント構造には踏み込まない。サーバが依存するのは仕様そのものであって、client の実装詳細ではない。ADR-0002 の「共有するのはワイヤ形式だけ」という原則はここで保たれている（変わったのは、その形式が散文ではなく実行可能な1ファイルとして書かれる点だけ）。
3. **攻撃者モデルが「悪意ある client」ではない。** これは `localhost` で著者が自分の原稿を編集するローカルツールであり、サーバは著者自身のブラウザとだけ話す。ここでの検証は敵対的入力への防壁ではなく、**壊れた JSON や古い形式のファイルで DB を壊さないための健全性チェック**である。境界の非対称性（サーバは client を疑ってよい）が要求するのは検証の存在であって、定義の重複ではない。
4. **重複が守るものは何もなかった。** 二重定義は「サーバが client より厳しく検証している」状態を作らない。定義が同一なのだから、拒否できる入力の集合も同一である。差が生まれるのはドリフトしたときだけで、そのとき生まれるのは追加の安全性ではなく §動機 の永久リトライである。

## Considered Options

- **契約テストで重複を守る**: 却下。重複を前提にした対症療法。しかも実装するには結局 client がスキーマを export する必要があり、**同じ変更をした上でテストを足す**ことになる。単一化後の契約テストは同語反復になる。
- **共有 `core` / `types` パッケージを作る**: 却下（ADR-0002 の判断を維持）。ブラウザはサーバドメイン（pdf/pipeline）を実行時に一切使わないので、下層に切り出す共有物は依然として存在しない。重なるのは db の封筒1つだけで、そのために3つ目のパッケージは要らない。
- **CLI が client 向けにスキーマを export する（逆向き）**: 却下（ADR-0002 の判断を維持）。`cli → client` に `client → cli` を足すと循環になり、「client は上流に依存しない純フロント」という不変条件を壊す。
- **ADR-0002 に追記する**: 却下。ADR-0002 のタイトル「ワイヤ型は各側が自前で持つ」そのものが撤回されるため、追記だと見出しが状態と矛盾する。

## Consequences

- client の `exports` に subpath を1つ足す: `"./dbSchema": "./src/lib/dbSchema.ts"`。`files` は既に `src` を配信しており（ADR-0002 / ADR-0010 のソース配信方式）、CLI は `module: nodenext` 解決で `.ts` を型ストリップ import する。`valibot` は両パッケージの `dependencies` にあるので新規依存は増えない。
- **依存の向きは変わらない。** `cli → client` の一方向のみ。この辺は既に存在していた（`cli.ts` が `import.meta.resolve('@note-first-presenter/client/package.json')` で client を解決している）。
- **`dbSchema.ts` は `valibot` だけに依存し、`$lib` 等のエイリアスや Svelte/ProseMirror を import してはならない。** パッケージ境界を越えて Node から直接読まれるため、client 内部でしか解決できない specifier が混ざると壊れる。この制約が掛かるのは `exports` で公開したファイルとその推移的な import 先だけで、`lib/` 全体の規則ではない（`lib/` には `.svelte` も `$lib` を使うストアも同居している）。
- **保護は型レベルである。** client は `dbSchema` を実行時に使わず、`DbV1` を導出して saver の引数型に使うだけである。したがって単一化が消すのは「サーバの受け入れ形と client の送信形がドリフトする」経路であり、client 側の実行時バグ（`DbV1` を騙った不正な値）は依然 400 になる。それは検証が仕事をしている状態なので正しい。
- **ファイル名は export subpath (`./dbSchema`) と一致させた。** `lib/` の他のファイルは kebab-case だが、公開 API 表面とファイル名が食い違う方が読みにくい。`lib/db/` には `client.svelte.ts` が残る。
- **`@note-first-presenter/client` は CLI の `peerDependencies` のまま置く。** これは「ランタイム依存は `dependencies` に宣言する」（`CLAUDE.md`）の例外ではなく、その規則が守ろうとしている「公開ユーザーで解決できない import」を peer 宣言が既に防いでいる形である。CLI は client のソースを Vite の `root` として配信するので、client 無しでは元から動かない——つまり**バージョンが結合した単一実体でなければならず**、`dependencies` にすると重複インストールを許してしまう。これは peer 宣言が表現する関係そのものである。
  - 〔ADR-0020 での追記〕この配置には、当時見えていなかった第二の効用がある。**公開形態を検証するとき、隔離ディレクトリに2つの tarball を並べて入れるだけで peer が満たされる** — `package.json` の書き換えもレジストリアクセスも要らない。`dependencies` だと exact version でレジストリを見に行くので、pack 前にワークスペース依存を `file:` に書き換える工程（Slidev の `scripts/pack.mjs` がやっていること）が必要になり、その書き換えは作業ツリーを汚す。
- **ADR-0002 は本決定により superseded となる。** 撤回されるのは「ワイヤ型は各側が自前で定義する」だけだが、それが 0002 のタイトルの主張なので追記では見出しが状態と矛盾する。0002 の残る判断（共有 `core` パッケージを作らない / 依存は `cli → client` の一方向 / `SlidesStatus` は二重定義のまま）は本 ADR が引き取っている。
- **`ADR-0010` の制約を継承する。** Node は `node_modules` 配下の `.ts` を型ストリップしない（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。pnpm workspace ではシンボリックリンクの実体パスが `node_modules` の外なのでローカル開発と全テスト層で問題にならないが、**公開パッケージとしてインストールされた場合はこの import が失敗する**。ただしこれは新しい制約ではなく、CLI 自身が `bin/*.mjs` から `../src/cli.ts` を import する時点で既に同じ壁に当たる。**配信方式の問題として ADR-0010 の側で解く**（本 ADR はその解決策に追加要件を課さない）。
  - 〔ADR-0020 での追記〕解決済み。この import は CLI の `dist/` に焼き込まれるようになり（`deps.alwaysBundle`）、公開ユーザーの Node が client の `.ts` を掴む経路は消えた。client 側の `exports` も `files` も変わっていない — `.ts` の subpath 公開は、読むのが Vite である限り正しいままである。
- **単一化の範囲は db の封筒だけ。** client の `SlidesMeta` と CLI の `SlidesStatus` は同名でも同型でもなく（前者は `hash` / `pageCount`、後者は `path` を持つ）、サーバが後者から前者を導出する関係なので、単一定義にはならない。ADR-0002 の「`SlidesStatus` は意図的に二重定義される」は生き残る。
- db の**形式**は変わらない（`{ version: 1, title, outline }`、`outline` は不透明 JSON）。変わったのは定義の所在だけである。
- `defaultDb()` の形（空タイトル + 空の `list_item` 1つ）を検証するテストは client 側（`src/lib/__tests__/dbSchema.test.ts`）に移る。CLI 側は「ファイルが無ければ client の既定を返す」という自分の振る舞いだけを検証する。
