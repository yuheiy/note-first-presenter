# Full-fledged NodeRangeSelection — Design

Status: approved
Date: 2026-05-27
Owner: outliner

## Goal

Outliner（ProseMirror ベース）で、連続する兄弟 `list_item` をひとまとめに扱う本格的な範囲選択
（NodeRangeSelection）を導入する。これにより以下が可能になる:

- 複数の list_item を一括選択して move / duplicate / fold / copy / cut / delete / indent / outdent
- bullet（li ハンドル）のドラッグによる並べ替え
- bullet の Shift+Click による範囲拡張
- `Shift+ArrowUp/Down` による範囲拡張

MVP 時点では `NodeSelection`（単一 li 選択）と `TextSelection` のみで、複数 list_item を
またぐ一括操作はできなかった。本実装でその欠落を埋める。

## Non-goals

- 異なる親リスト（深度違い）にまたがる範囲選択
- ドラッグ先としてネストされた子リストへの drop（同一深度の隣接 boundary のみ）
- HTML5 drag API への移行（NodeView を用いない方針）

## Approach

ProseMirror の Selection 抽象に素直に乗せるため、`Selection` を継承した
`NodeRangeSelection` クラスを新規導入する。`Selection.jsonID('nodeRange', NodeRangeSelection)`
で登録すれば、history / collab / clipboard など既存のパイプラインに自動で乗る。

選択生成 UI は3経路:

1. `Shift+ArrowUp/Down` キー
2. bullet の `Shift+Click`
3. bullet の mousedown→mousemove によるドラッグ並べ替え（同時にドラッグ範囲を選択）

既存コマンド（move / duplicate / fold / smartBackspace / smartDelete / Tab / Shift-Tab）には
「selection が NodeRangeSelection なら範囲動作」のガードを先頭に追加する。clipboard / paste は
`selection.content()` と `tr.replaceSelection()` で完結するので変更不要。

## Architecture

### 1. NodeRangeSelection クラス

新規 `packages/client/src/lib/outliner/selections/node-range-selection.ts`:

```typescript
class NodeRangeSelection extends Selection {
  static jsonID = 'nodeRange';

  constructor($anchor: ResolvedPos, $head: ResolvedPos);

  forEachItem(fn: (pos: number, node: Node, index: number) => void): void;

  get parentList(): Node;
  get parentListPos(): number;
  get parentDepth(): number;
  get anchorIndex(): number;
  get headIndex(): number;
  get fromIndex(): number;
  get toIndex(): number;
  get itemCount(): number;

  map(doc: Node, mapping: Mappable): Selection;
  content(): Slice;
  replace(tr: Transaction, slice: Slice): void;
  replaceWith(tr: Transaction, node: Node): void;
  eq(other: Selection): boolean;
  toJSON(): { type: 'nodeRange'; anchor: number; head: number };
  static fromJSON(doc: Node, json: unknown): NodeRangeSelection;
  getBookmark(): NodeRangeBookmark;
}
```

**不変条件**:

- `$anchor.depth === $head.depth`
- `$anchor` と `$head` は同一親リスト（`bullet_list`）配下の sibling boundary
- `from` は `min(anchorPos, headPos)`、`to` は `max(anchorPos+anchorNode.nodeSize, headPos+headNode.nodeSize)`
- 範囲には少なくとも 1 つの `list_item` を含む（空範囲は作らない）

**map**: 文書変換後に親リストが壊れる / 範囲がカバーできなくなる場合は `TextSelection.near` に
フォールバック。Bookmark 同様の挙動。

**content**: `this.$from.doc.slice(this.from, this.to)` をそのまま返す。`openStart`/`openEnd` は
ProseMirror の `Node.slice` 既定（親リスト境界で 1）になり、別 bullet_list への paste 時に自然に
merge される。

**replace / replaceWith**: 基底 `Selection.prototype.replace` の挙動で十分（範囲を delete してから
slice 挿入）。NodeSelection と異なり「single node を差し替える」セマンティクスは持たない。

### 2. Selection 拡張操作

#### キーボード (`commands/range-select.ts`)

新規:

```typescript
export const extendRangeSelectionUp: Command;
export const extendRangeSelectionDown: Command;
export const exitRangeSelection: Command;
```

ロジック:

- 現在の selection が `NodeSelection` on list_item / `NodeRangeSelection`:
  head item index ± 1 で拡張。境界外なら `false`。
- `TextSelection` のとき: `false` を返し、デフォルトのテキスト範囲拡張に委ねる。
  範囲モードへ突入するには bullet click が必要。
- `Escape` で範囲選択を抜けて TextSelection（範囲先頭 paragraph の末尾位置）に戻す
  `exitRangeSelection` も提供し、Outliner.svelte の keymap に追加。

#### マウス (`plugins/bullet-click.ts` 改修)

handleClickOn の `direct && node.type === list_item` 条件下で:

- **通常 click**: 現状通り `NodeSelection.create(doc, nodePos)`。
- **Shift+Click**: 現在 selection の anchor が NodeSelection / NodeRangeSelection なら、その
  anchor item と clicked item を `NodeRangeSelection` に変換。anchor が異なる親リストなら
  単一 `NodeSelection` にフォールバック。

mousedown レイヤは `bullet-drag.ts` 側で扱う（後述）。clickのみ確定するのは
mouseup 時に drag 閾値を超えなかった場合。

### 3. ドラッグ並べ替え (`plugins/bullet-drag.ts` 新規)

HTML5 drag API は使わず自前で実装する。NodeView 化は行わない。

Plugin state:

```typescript
type DragState =
  | { phase: 'idle' }
  | {
      phase: 'pending';
      sourceFrom: number;
      sourceTo: number;
      sourceDepth: number;
      startX: number;
      startY: number;
    }
  | {
      phase: 'dragging';
      sourceFrom: number;
      sourceTo: number;
      sourceDepth: number;
      dropPos: number | null;
    };
```

イベント遷移:

- **mousedown on bullet area**（li 直下で `target.closest('p')` が無いケース）:
  - shift キーが押されていなければ:
    - 現在 selection が NodeRangeSelection / NodeSelection でその範囲に押下 item が含まれているなら範囲を維持
    - そうでなければ単 NodeSelection を作って維持
  - sourceFrom/sourceTo/sourceDepth を記録し、phase を `pending` に。
  - `window.addEventListener('mousemove' / 'mouseup', ...)`。
- **mousemove**（閾値 |dx|+|dy| > 3px）:
  - phase を `dragging` に。`body.classList.add('nfp-dragging')`。
  - 座標から drop position 計算:
    - `view.posAtCoords({ left: x, top: y })` で pos
    - その pos を含む li を辿り、cursor の Y が li 上半か下半かで before/after を決定
    - 同一 `sourceDepth` の隣接 boundary に snap
    - 自身の範囲内 boundary なら no-op（dropPos = null）
  - state.dropPos を更新 → Decoration を再計算。
- **mouseup**:
  - phase が `dragging` で `dropPos !== null` なら、移動トランザクションを dispatch:
    1. `tr.delete(sourceFrom, sourceTo)`
    2. mapping を経由した dropPos に対して `tr.insert(mappedDropPos, sliceContent)`
    3. 新しい selection を「移動後の範囲」を覆う NodeRangeSelection（item が 1 つなら NodeSelection）に
  - phase が `pending` なら何もしない（click はすでに mousedown 時に処理済）。
  - `body.classList.remove('nfp-dragging')`、window リスナ解除、state を `idle` に。

### 4. 既存コマンドの range 対応

すべて先頭に「`selection instanceof NodeRangeSelection` なら range 動作」のガードを追加する。
単一 list_item のときの挙動は完全に現状維持。

| Command                        | range 動作                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `moveItemUp/Down`              | 範囲全体と隣接 sibling を入れ替え。境界に達したら `false`。                                                     |
| `duplicateItem`                | 範囲をコピーして末尾直後に挿入。selection は複製範囲に移動。                                                    |
| `collapseItem/expandItem`      | 範囲内の各 list_item の `collapsed` 属性を一括更新（child list を持たない item はスキップ）。                   |
| `smartBackspace`/`smartDelete` | 範囲全体を delete し、空 list_item を残して TextSelection に戻す。                                              |
| `liftListItem` (Shift-Tab)     | 範囲を含む `NodeRange` を構築して `lift(state, dispatch)` で outdent。深さが足りなければ `false`。              |
| `sinkListItem` (Tab)           | 同様に `wrapInList(bullet_list)` で indent。直前 sibling が存在しなければ `false`（ProseMirror の制約に従う）。 |
| `splitListItem` (Enter)        | 範囲を delete → 空 item を残して TextSelection 化。                                                             |

clipboard.ts と paste.ts は `selection.content()` / `replaceSelection()` ベースなので、
NodeRangeSelection.content() が正しい Slice を返せば変更不要。

### 5. 視覚スタイル

新規プラグイン `plugins/range-selection-decorations.ts`:

- NodeRangeSelection 時、範囲内 li に `Decoration.node(pos, pos+node.nodeSize, { 'data-range-selected': 'true' })` を付与。
- bullet-drag plugin と協調して、drop position に widget Decoration（横線）を挿入。

CSS（`Outliner.svelte` の `<style>` に追記）:

```css
.outliner-root :global(li[data-range-selected='true']) {
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  border-radius: 4px;
}
.outliner-root :global(.nfp-drop-indicator) {
  height: 2px;
  background: var(--color-accent);
  margin-block: -1px;
}
.outliner-root :global(li::marker) {
  cursor: grab;
}
:global(body.nfp-dragging) {
  cursor: grabbing !important;
}
```

## Data flow

```
User input
  ├─ key Shift+ArrowUp/Down
  │     → range-select command → NodeRangeSelection (extend head index ±1)
  ├─ mouse click on bullet
  │     ├─ no shift  → NodeSelection
  │     ├─ shift     → NodeRangeSelection
  │     └─ mousedown → bullet-drag pending → dragging → tr.delete + tr.insert
  └─ keyboard Enter / Backspace / Tab / Shift-Tab / Mod-Shift-D / Mod-Shift-Arrow
        → 各 command が NodeRangeSelection を分岐処理

NodeRangeSelection state
  ├─ decorations plugin → 範囲内 li のハイライト
  └─ bullet-drag plugin → drop indicator decoration

Clipboard / Paste
  └─ selection.content() で Slice 化 → 既存 clipboard.ts / paste.ts が透過処理
```

## Edge cases

- 範囲が doc の境界に達した状態での move → `false`
- 範囲を delete してアウトラインが空になる → MVP のセパレータ仕様を維持するため、ルートに空 list_item を 1 つ残す
- separator (`---` だけの list_item) を含む範囲 → 通常通り扱う（separator は単なる list_item として）
- mousedown が paragraph の真上で発生 → bullet-drag は発火しない（テキスト編集を阻害しない）
- ドラッグ中にウィンドウからカーソルが外れる → mouseup（または mouseleave）でキャンセル

## Testing strategy

Vitest (jsdom 環境):

- `__tests__/node-range-selection.test.ts`: jsonID 登録、map、content、replace、eq、fromJSON、getBookmark、parentList ヘルパ、anchor/head ↔ from/to/index 変換、エッジケース
- `__tests__/range-select.test.ts`: extendUp/Down コマンド、境界 no-op、TextSelection 時のフォール、exitRangeSelection
- `__tests__/range-commands.test.ts`: move/duplicate/fold/smartBackspace/smartDelete/Tab/Shift-Tab の range 動作と境界 no-op
- `__tests__/range-clipboard.test.ts`: NodeRangeSelection の copy/cut で生成される `INTERNAL_MIME` JSON が正しく round-trip し、paste で復元できる
- `__tests__/bullet-drag.test.ts`: posAtCoords を mock した drop position 計算、自身範囲 drop の no-op

Playwright:

- `e2e/outliner-range.e2e.ts`: bullet click → shift+click で範囲確認、Shift+ArrowUp/Down 拡張、ドラッグ&ドロップで並べ替え、Tab/Shift-Tab で範囲 indent、Backspace で範囲削除

完了条件: `vp check` / `vp test` / `pnpm exec playwright test` がすべて green。

## File changes

新規:

- `packages/client/src/lib/outliner/selections/node-range-selection.ts`
- `packages/client/src/lib/outliner/commands/range-select.ts`
- `packages/client/src/lib/outliner/plugins/bullet-drag.ts`
- `packages/client/src/lib/outliner/plugins/range-selection-decorations.ts`
- `packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-select.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-clipboard.test.ts`
- `packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts`
- `packages/client/e2e/outliner-range.e2e.ts`

変更:

- `packages/client/src/lib/outliner/Outliner.svelte`: `Selection.jsonID` 登録、新 keymap、新プラグイン追加
- `packages/client/src/lib/outliner/commands/move.ts`: NodeRangeSelection 分岐追加
- `packages/client/src/lib/outliner/commands/duplicate.ts`: 同上
- `packages/client/src/lib/outliner/commands/fold.ts`: 同上
- `packages/client/src/lib/outliner/commands/backspace.ts`: 同上
- `packages/client/src/lib/outliner/plugins/bullet-click.ts`: Shift+Click 拡張、mousedown→drag 連携

## Open decisions（合意済み）

1. テキスト中の Shift+ArrowUp/Down では範囲モードに突入しない（TextSelection→NodeSelection の遷移は bullet click のみ）。
2. 範囲選択は同一親リスト（深度違いをまたがない）に限定する。
3. Drag drop target は同一深度の隣接 boundary のみ（ネストへの drop は不可）。
