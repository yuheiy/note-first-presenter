# 永続化ストアの共有抽象（PersistedValue）は重複が実在するまで導入しない

アーキテクチャレビュー（2026-06-15）で `ActiveSlideStore`（URL `?slide=N`）と `ThemeStore`（localStorage `nfp:theme`）が「値 + マウント時 hydrate + 変更時 persist」という同形を別バックエンドで繰り返している点が deepening 候補に挙がったが、現時点では共有 `PersistedValue<T>` 抽象を導入しない。両ストアは各 ~25行と小さく、バックエンドだけでなく persist のタイミングも異なる（URL は `history.replaceState` を変更ごとに呼ぶのに対し、localStorage は `$effect` 経由）。[[0011-adopt-ark-ui-headless-primitives]] が UI プリミティブについて示した「同一の重複が実際に現れるまで抽象化は空回りする」という方針を、永続化ストアにも適用する。`DbStore`（デバウンス HTTP 保存）と `SlidesMetaStore`（fetch 専用）は同形に収まらず、対象外。

## Considered Options

- **`PersistedValue<T>` + ストレージアダプタ（URL / localStorage の2アダプタ）**: 却下（現時点）。2つの小さなストアでは抽象化のコストに見合わず、ADR-0011 の方針と整合しない。2アダプタはseamを正当化するが、各実装が薄く重複の痛みが実在しないため、抽象は空回りする。
- **各ストアが自前で hydrate/persist を持つ（現状維持）**: 採用。

## Consequences

- 3つ目の永続化値が現れた時点で本 ADR を見直し、`PersistedValue` 抽象を再検討する。
- 本 ADR は値ストアの永続化に限った判断であり、`DbStore` / `SlidesMetaStore` のような非同形ストアには及ばない。
