# 2パッケージ・共有コードゼロ、ワイヤ型は各側が自前で持つ

依存は `cli → client` の一方向のみで、client はサーバドメイン（pdf/pipeline）を実行時に一切使わない純フロントである。そのため下層に切り出す共有物が存在しないと判断し、共有 `core`/`types` パッケージを作らず、ネットワーク境界をまたぐ JSON については **client と CLI がそれぞれ自前の型を定義**する（コードは共有せず、共有するのはワイヤ形式だけ）。重なるワイヤ表面は db の `{ version, title }` 程度に留まる。

## Considered Options

- **共有 `core` / `types` パッケージ**: 却下。ブラウザがサーバドメインを実消費しないため切り出す共有物がない。重なりが僅少で、各側が自前定義すれば足りる。
- **CLI が client 向けに型を export**: 却下。`cli → client`（peerDep）に `client → cli` を足すと循環になり、「client は上流に依存しない純フロント」という不変条件を壊す。

## Consequences

- `SlidesStatus` や db の形は意図的に二重定義される。ドリフトのコストは僅少。
- サーバは outline を不透明 JSON として永続化し、PUT は**サーバ自前の valibot スキーマ**で入力検証する（信頼境界のガード。client の内部モデルには依存しない）。
