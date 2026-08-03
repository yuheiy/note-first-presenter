# db のワイヤスキーマを client が所有し、CLI が subpath import する

db の封筒（`{ version: 1, title, outline }`、`outline` は不透明 JSON）の valibot 定義とデフォルト値は、client と CLI に1文字違わず二重定義されていた。これを **client が単一定義を所有し `@note-first-presenter/client/dbSchema` として export、CLI が import する**形に改める。「ワイヤ型は各側が自前で持つ」という当初方針の撤回である。残る当初判断 — 共有 `core`/`types` パッケージは作らない・依存は `cli → client` の一方向のみ・`SlidesStatus` は意図的に二重定義のまま — は本 ADR が引き継ぐ。

## 動機

「原稿が消えない」の最も静かな壊れ方は、client が組み立てた PUT ボディをサーバの valibot が拒否することである。定義が二重だと、片方だけを触った編集が型検査もテストも通ったまま「saver が 400 を永久リトライし、UI は汎用の保存エラーだけ」という本番の齟齬になる。また `emptyDb()` はサーバ側にありながら ProseMirror のノード名をハードコードしており、所有権は既に漏れていた。

## なぜ client 所有のスキーマでサーバが untrusted 入力を検証してよいのか

- 信頼境界が守るのは「サーバのファイル I/O の直前で形を確かめる」ことであって、スキーマ定義の出自ではない。定義が同一なら拒否できる入力の集合も同一で、二重定義が足していた安全性はゼロ（差が出るのはドリフトした時だけで、それは §動機 の事故そのもの）。
- `dbSchema.ts` は client の内部モデルではなく**ワイヤ形式の仕様**である。封筒の3フィールドしか知らず `outline` は `v.unknown()` のまま — ProseMirror のドキュメント構造には踏み込まない。
- 攻撃者モデルは「悪意ある client」ではない。localhost で著者が自分の原稿を編集するローカルツールであり、この検証は壊れた JSON や古い形式のファイルから DB を守る健全性チェックである。

## Considered Options

- **契約テストで重複を守る**: 却下。実装には結局 client の export が要り、単一化後の契約テストは同語反復になる。
- **共有 `core` / `types` パッケージ**: 却下。重なるのは db の封筒1つで、そのために3つ目のパッケージは要らない。
- **CLI 側から逆向きに export**: 却下。`client → cli` を足すと循環になり、「client は上流に依存しない純フロント」という不変条件を壊す。

## Consequences

- client の `exports` に `"./dbSchema": "./src/lib/dbSchema.ts"` を足すだけ。`valibot` は両パッケージの `dependencies` にあり新規依存ゼロ。CLI 側のこの import は `dist/` に焼き込まれる（`deps.alwaysBundle`、ADR-0020）ので、公開ユーザーの Node が client の `.ts` を掴む経路はない。
- `dbSchema.ts` は valibot 以外に依存してはならない（詳細は同ファイル冒頭のコメントが正本）。
- **`@note-first-presenter/client` は CLI の `peerDependencies` のまま置く。** CLI は client のソースを Vite の `root` として配信するので、両者はバージョンが結合した単一実体でなければならず、`dependencies` にすると重複インストールを許してしまう。副次効用として、公開形態の検証時は隔離ディレクトリに2つの tarball を並べて入れるだけで peer が満たされる（`verify:package`、ADR-0021 が利用）。
- 単一化の範囲は db の封筒だけ。client の `SlidesMeta` と CLI の `SlidesStatus` は同型ではなく（サーバが後者から前者を導出する）、意図的に二重定義のまま残る。
- 保護は型レベルである。client は `dbSchema` を実行時に使わず `DbV1` を導出するだけなので、単一化が消すのは送信形と受け入れ形のドリフト経路であり、実行時の不正値は依然 400 になる（それは検証が仕事をしている状態）。
