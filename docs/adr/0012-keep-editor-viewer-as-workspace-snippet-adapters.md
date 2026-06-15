# Editor と Viewer は統合せず、Workspace のスニペット境界で薄いアダプタとして保つ

アーキテクチャレビュー（2026-06-15）で `Editor.svelte` と `Viewer.svelte` の構成が約60行重複している点が deepening 候補として挙がったが、両者を統合しない決定をする。`Editor`/`Viewer` は既に `Workspace` のスニペット境界（`titleArea` / `outliner`）を埋める2つの薄いアダプタであり、共有レイアウトという深いモジュールは `Workspace` 側に存在する。差分（`DbStore` による保存 vs 静的読み込み、`/api/db` vs `/nfp-data/db.json`、編集可能な `input` vs 静的な `h1`、`editable` フラグ）は実在し、1つのコンポーネントに統合すると `editable` による内部分岐が増えて locality はむしろ低下する。dev=Editor / prod=Viewer の分岐は [[0007-sveltekit-for-ui-layer-cli-keeps-api]] が意図的に定めた境界である。

## Considered Options

- **`editable` prop を取る単一ホストへ統合**: 却下。共有できるのは `onMount` のロード手続き約15行のみで、両モードの markup は本質的に異なりスニペットとして渡し続ける必要がある。意図的に分離された2モードを結合する代償に見合わない。
- **現状維持（Workspace のスニペット境界で分割）**: 採用。`Workspace` のスニペット境界が既に「共有レイアウト＝深いモジュール／2つの薄いアダプタ」という形を提供している。

## Consequences

- 将来この重複が再び deepening 候補として挙がっても、本 ADR を参照して再提案を避ける。
- ロード手続きの重複が15行を大きく超えて増えた場合、または3つ目のモードが現れた場合は再検討する。
