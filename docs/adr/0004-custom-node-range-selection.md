# 連続兄弟バレットの範囲操作は自作 NodeRangeSelection で実現する

連続する兄弟 `list_item` をひとまとめに move/duplicate/fold/copy/cut/delete/indent/outdent し、shift+click やドラッグで範囲を作る機能のため、ProseMirror の `Selection` を継承した `NodeRangeSelection` を自作し `Selection.jsonID('nodeRange', ...)` で登録する。これにより history/collab/clipboard など既存パイプラインに自動で乗る。ドラッグ並べ替えは NodeView も HTML5 drag API も使わず自前の mousedown→mousemove→mouseup で実装する。

## Considered Options

- **HTML5 drag API + NodeView 化**: 却下。実装が重く、NodeView を持ち込まない方針と相反する。自前のポインタハンドリングで posAtCoords ベースの drop 計算を行う。

## Consequences

- 範囲選択は同一親リスト・同一深度に限定する（深度違いをまたがない／ネストへの drop は不可）。
- ProseMirror の `Selection` 抽象に深く食い込むため、覆すコストは高い。
