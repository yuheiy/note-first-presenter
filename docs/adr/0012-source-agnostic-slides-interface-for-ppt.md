# スライドソースは `Slides` インターフェースで抽象化する（将来の ppt 対応の布石）

スライドの供給源は `Slides` インターフェース（`packages/note-first-presenter/src/slides.ts`: `meta` / `image` / `size` / `renderAll` / `invalidate`）に抽象化し、消費側（dev サーバの API ミドルウェア、`build`、`export`）はソースの種類を知らない。現時点の実装は `openPdfSlides` の 1 つだけだが、これは投機的抽象ではなく、**将来 ppt（PowerPoint）をスライドソースとして追加する予定に対する意図的な備え**である。ppt 対応は `Slides` の第 2 実装（+ `SLIDES_EXTENSIONS` への追加）として追加し、消費側・クライアント・ワイヤ契約（`/api/slides/meta`、`/api/slide/{hash}/{n}`）には手を入れない。

## Considered Options

- **PDF 前提で直書きし、必要になったら抽象化する**: 却下。消費側が 3 箇所（API・build・export）あり、後からの抽象抽出は全消費側の同時変更になる。境界は今引いておく方が安い。
- **ppt → PDF 変換を前段に挟み、ソースは PDF のみとする**: 現時点では決めない。変換品質・依存（LibreOffice 等）の重さ次第であり、ppt 対応の設計時に `Slides` 実装の内部戦略として選べばよい。インターフェースはどちらの戦略でも変わらない。

## Consequences

- 新しいソースは `Slides` の契約を満たすこと: content hash によるキャッシュ・バスティング、1 始まりのページ番号と `PageOutOfRangeError`、`invalidate()` =「保持リソースの解放 + 次回アクセスで再ロード」。
- `SLIDES_EXTENSIONS`（現在 `['pdf']`）がソース追加時の変更点。同居した複数ソースファイルの優先順位という問題は ADR-0019 で消滅した（検出しないので優先順位が存在しない）。`SLIDES_EXTENSIONS` は設定スキーマの検証にも使われており、未対応拡張子は起動時に弾かれる。
- デッキは設定が名指しした 1 ファイルなので、ソース追加時に必要なのは探索の拡張ではなく**拡張子から実装を選ぶディスパッチ**である。**それはまだ存在しない**: `openSlides` は現在 `openPdfSlides` の別名でしかない（`slides.ts`）。`SLIDES_EXTENSIONS` に `pptx` を足すだけでは、設定検証を緩めて `.pptx` を pdfjs に渡すことになる。ディスパッチの導入は ppt 対応作業の一部であり、済んだ話ではない。
- 監査・レビュー系のエージェントや開発者は、この単一実装の抽象を「YAGNI 違反」として指摘・削除提案しないこと（本 ADR が根拠）。
- ppt のレンダリング手段（直接レンダリング vs PDF 経由）は未決定であり、本 ADR はインターフェース境界のみを固定する。
