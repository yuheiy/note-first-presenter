# NodeRangeSelection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ProseMirror outliner で連続兄弟 `list_item` を覆う本格 NodeRangeSelection を導入し、handle のドラッグ並べ替え・Shift+Click 拡張・Shift+ArrowUp/Down 拡張・既存コマンドの範囲対応を実現する。

**Architecture:** `Selection` を継承した `NodeRangeSelection` クラスを `Selection.jsonID('nodeRange', ...)` で登録し、ProseMirror の transaction/clipboard パイプラインに乗せる。選択生成は `Shift+ArrowUp/Down` / bullet `Shift+Click` / bullet ドラッグの 3 経路。`move` / `duplicate` / `fold` / `smartBackspace` / `smartDelete` / `lift|sinkListItem` / `splitListItem` の各 command に「NodeRangeSelection なら範囲動作」のガードを追加する。視覚は新規プラグインによる decoration。

**Tech Stack:** TypeScript, Svelte 5, ProseMirror (prosemirror-state / prosemirror-model / prosemirror-view / prosemirror-schema-list / prosemirror-transform), Vitest (`vite-plus/test`), Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-27-node-range-selection-design.md`

---

## Conventions

- すべての作業は worktree `worktree-node-range-selection` で行う（pwd は `.claude/worktrees/node-range-selection`）。
- テストは `vp test --run packages/client/src/lib/outliner/__tests__/<file>` で個別に走らせる。最終確認は `vp check && vp test --run`。
- E2E は `pnpm --filter @note-first-presenter/client exec playwright test packages/client/tests/e2e/outliner-range.e2e.ts`（root の `pnpm exec playwright test` でも可）。
- コミットは各 Task の最後に 1 つ。`Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` を付ける。

---

## File Structure

新規:

- `packages/client/src/lib/outliner/selections/node-range-selection.ts` — NodeRangeSelection クラス本体と registration helper
- `packages/client/src/lib/outliner/commands/range-select.ts` — `extendRangeSelectionUp/Down` と `exitRangeSelection`
- `packages/client/src/lib/outliner/plugins/range-selection-decorations.ts` — 範囲ハイライト decoration
- `packages/client/src/lib/outliner/plugins/bullet-drag.ts` — bullet ドラッグ並べ替え（state + DOM event）
- `packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-select.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
- `packages/client/src/lib/outliner/__tests__/range-clipboard.test.ts`
- `packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts`
- `packages/client/tests/e2e/outliner-range.e2e.ts`

変更:

- `packages/client/src/lib/outliner/Outliner.svelte`
- `packages/client/src/lib/outliner/plugins/bullet-click.ts`
- `packages/client/src/lib/outliner/commands/move.ts`
- `packages/client/src/lib/outliner/commands/duplicate.ts`
- `packages/client/src/lib/outliner/commands/fold.ts`
- `packages/client/src/lib/outliner/commands/backspace.ts`

---

## Task 1: NodeRangeSelection クラス（基本形）

**Files:**

- Create: `packages/client/src/lib/outliner/selections/node-range-selection.ts`
- Test: `packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`:

```typescript
import { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vite-plus/test';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]): Node {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: Node, index: number): number {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('NodeRangeSelection', () => {
  it('covers a single item as both anchor and head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 1), itemPos(doc, 1));
    expect(sel).not.toBeNull();
    expect(sel!.itemCount).toBe(1);
    expect(sel!.fromIndex).toBe(1);
    expect(sel!.toIndex).toBe(1);
  });

  it('covers two consecutive siblings forward', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1));
    expect(sel!.itemCount).toBe(2);
    expect(sel!.fromIndex).toBe(0);
    expect(sel!.toIndex).toBe(1);
    expect(sel!.from).toBe(itemPos(doc, 0));
    expect(sel!.to).toBe(itemPos(doc, 2));
  });

  it('orders fromIndex/toIndex by position when anchor is after head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 2), itemPos(doc, 0));
    expect(sel!.fromIndex).toBe(0);
    expect(sel!.toIndex).toBe(2);
    expect(sel!.anchorIndex).toBe(2);
    expect(sel!.headIndex).toBe(0);
  });

  it('forEachItem yields each item once in document order', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    const seen: string[] = [];
    sel.forEachItem((_pos, node) => seen.push(node.firstChild?.textContent ?? ''));
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('eq returns true for equal selections', () => {
    const doc = makeDoc(['a', 'b']);
    const a = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const b = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    expect(a.eq(b)).toBe(true);
  });

  it('eq returns false for differing head', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const a = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const b = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 2))!;
    expect(a.eq(b)).toBe(false);
  });

  it('NodeRangeSelection instanceof Selection', () => {
    const doc = makeDoc(['a']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0))!;
    expect(sel).toBeInstanceOf(NodeRangeSelection);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`
Expected: FAIL — `Cannot find module '../selections/node-range-selection'`

- [ ] **Step 3: クラスを最小実装**

`packages/client/src/lib/outliner/selections/node-range-selection.ts`:

```typescript
import { type Node, type ResolvedPos, Slice } from 'prosemirror-model';
import {
  type Mappable,
  Selection,
  type SelectionBookmark,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

export class NodeRangeSelection extends Selection {
  static readonly jsonID = 'nodeRange';

  constructor($anchor: ResolvedPos, $head: ResolvedPos) {
    const aIndex = $anchor.index($anchor.depth);
    const hIndex = $head.index($head.depth);
    const fromIndex = Math.min(aIndex, hIndex);
    const toIndex = Math.max(aIndex, hIndex);
    const parent = $anchor.node($anchor.depth);
    const parentStart = $anchor.start($anchor.depth);

    let fromPos = parentStart;
    for (let i = 0; i < fromIndex; i++) fromPos += parent.child(i).nodeSize;
    let toPos = parentStart;
    for (let i = 0; i <= toIndex; i++) toPos += parent.child(i).nodeSize;

    super($anchor.doc.resolve(fromPos), $anchor.doc.resolve(toPos));
  }

  get parentDepth(): number {
    return this.$from.depth;
  }

  get parentList(): Node {
    return this.$from.node(this.parentDepth);
  }

  get parentListPos(): number {
    return this.$from.start(this.parentDepth);
  }

  get anchorIndex(): number {
    return this.$anchor.index(this.$anchor.depth);
  }

  get headIndex(): number {
    return this.$head.index(this.$head.depth);
  }

  get fromIndex(): number {
    return Math.min(this.anchorIndex, this.headIndex);
  }

  get toIndex(): number {
    return Math.max(this.anchorIndex, this.headIndex);
  }

  get itemCount(): number {
    return this.toIndex - this.fromIndex + 1;
  }

  forEachItem(fn: (pos: number, node: Node, index: number) => void): void {
    const list = this.parentList;
    let pos = this.parentListPos;
    for (let i = 0; i < this.fromIndex; i++) pos += list.child(i).nodeSize;
    for (let i = this.fromIndex; i <= this.toIndex; i++) {
      const node = list.child(i);
      fn(pos, node, i);
      pos += node.nodeSize;
    }
  }

  eq(other: Selection): boolean {
    return (
      other instanceof NodeRangeSelection &&
      other.$anchor.pos === this.$anchor.pos &&
      other.$head.pos === this.$head.pos
    );
  }

  map(doc: Node, mapping: Mappable): Selection {
    const anchor = mapping.mapResult(this.$anchor.pos);
    const head = mapping.mapResult(this.$head.pos);
    if (anchor.deleted || head.deleted) return TextSelection.near(doc.resolve(anchor.pos));
    try {
      const $a = doc.resolve(anchor.pos);
      const $h = doc.resolve(head.pos);
      const valid =
        $a.depth === $h.depth &&
        $a.node($a.depth) === $h.node($h.depth) &&
        $a.node($a.depth).type === BULLET_LIST;
      if (!valid) return TextSelection.near(doc.resolve(anchor.pos));
      return new NodeRangeSelection($a, $h);
    } catch {
      return TextSelection.near(doc.resolve(anchor.pos));
    }
  }

  content(): Slice {
    return this.$from.doc.slice(this.from, this.to);
  }

  replace(tr: Transaction, content: Slice = Slice.empty): void {
    super.replace(tr, content);
  }

  replaceWith(tr: Transaction, node: Node): void {
    super.replaceWith(tr, node);
  }

  toJSON(): { type: 'nodeRange'; anchor: number; head: number } {
    return { type: 'nodeRange', anchor: this.$anchor.pos, head: this.$head.pos };
  }

  static fromJSON(doc: Node, json: { anchor?: unknown; head?: unknown }): NodeRangeSelection {
    if (typeof json.anchor !== 'number' || typeof json.head !== 'number') {
      throw new RangeError('Invalid input for NodeRangeSelection.fromJSON');
    }
    return new NodeRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }

  getBookmark(): SelectionBookmark {
    const a = this.$anchor.pos;
    const h = this.$head.pos;
    return {
      map(mapping: Mappable) {
        return {
          map: this.map,
          resolve(doc: Node) {
            try {
              return new NodeRangeSelection(
                doc.resolve(mapping.map(a)),
                doc.resolve(mapping.map(h)),
              );
            } catch {
              return TextSelection.near(doc.resolve(mapping.map(a)));
            }
          },
        } as SelectionBookmark;
      },
      resolve(doc: Node) {
        try {
          return new NodeRangeSelection(doc.resolve(a), doc.resolve(h));
        } catch {
          return TextSelection.near(doc.resolve(a));
        }
      },
    };
  }
}

Selection.jsonID('nodeRange', NodeRangeSelection);

export function isNodeRangeSelection(sel: Selection): sel is NodeRangeSelection {
  return sel instanceof NodeRangeSelection;
}

// Resolve anchor/head item *before* positions in a shared bullet_list. Returns null when
// the two positions do not share a bullet_list parent.
export function createNodeRangeSelection(
  doc: Node,
  anchorItemPos: number,
  headItemPos: number,
): NodeRangeSelection | null {
  try {
    const $a = doc.resolve(anchorItemPos);
    const $h = doc.resolve(headItemPos);
    if ($a.depth !== $h.depth) return null;
    const parentA = $a.node($a.depth);
    const parentH = $h.node($h.depth);
    if (parentA !== parentH) return null;
    if (parentA.type !== BULLET_LIST) return null;
    const aChild = parentA.maybeChild($a.index($a.depth));
    const hChild = parentH.maybeChild($h.index($h.depth));
    if (!aChild || !hChild) return null;
    if (aChild.type !== LIST_ITEM || hChild.type !== LIST_ITEM) return null;
    return new NodeRangeSelection($a, $h);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`
Expected: PASS（7 件）

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/selections/node-range-selection.ts \
        packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts
git commit -m "$(cat <<'MSG'
Add NodeRangeSelection class covering sibling list_items

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: NodeRangeSelection の map / fromJSON / content をテスト追加

**Files:**

- Test: `packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts` (extend)

- [ ] **Step 1: テストを追加（同ファイル末尾）**

```typescript
import { Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

describe('NodeRangeSelection.content', () => {
  it('returns a slice covering selected list_items wrapped by bullet_list (openStart/openEnd = 1)', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const slice = sel.content();
    expect(slice.openStart).toBe(1);
    expect(slice.openEnd).toBe(1);
    expect(slice.content.childCount).toBe(2);
    expect(slice.content.child(0).type.name).toBe('list_item');
    expect(slice.content.child(0).firstChild?.textContent).toBe('a');
    expect(slice.content.child(1).firstChild?.textContent).toBe('b');
  });
});

describe('NodeRangeSelection.toJSON / fromJSON', () => {
  it('round-trips through JSON', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 1), itemPos(doc, 2))!;
    const json = sel.toJSON();
    expect(json.type).toBe('nodeRange');
    const restored = NodeRangeSelection.fromJSON(doc, json);
    expect(restored.eq(sel)).toBe(true);
  });

  it('is recognised by Selection.fromJSON via jsonID', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const json = state.toJSON();
    const restored = EditorState.fromJSON({ schema: outlinerSchema }, json);
    expect(restored.selection).toBeInstanceOf(NodeRangeSelection);
    expect((restored.selection as NodeRangeSelection).itemCount).toBe(2);
  });
});

describe('NodeRangeSelection.map', () => {
  it('survives mapping through an unrelated insertion before the range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 1), itemPos(doc, 2))!;
    const state = EditorState.create({ doc, selection: sel });
    const newItem = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('x')]),
    ]);
    const tr = state.tr.insert(itemPos(doc, 0), newItem);
    const mapped = state.selection.map(tr.doc, tr.mapping);
    expect(mapped).toBeInstanceOf(NodeRangeSelection);
    expect((mapped as NodeRangeSelection).itemCount).toBe(2);
  });

  it('falls back to TextSelection when the range is deleted', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const tr = state.tr.delete(itemPos(doc, 0), itemPos(doc, 2));
    const mapped = state.selection.map(tr.doc, tr.mapping);
    expect(mapped).not.toBeInstanceOf(NodeRangeSelection);
  });
});
```

- [ ] **Step 2: テストが全て通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts`
Expected: PASS（合計 12 件）

- [ ] **Step 3: コミット**

```bash
git add packages/client/src/lib/outliner/__tests__/node-range-selection.test.ts
git commit -m "$(cat <<'MSG'
Cover NodeRangeSelection content, JSON round-trip, mapping

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: Outliner.svelte で NodeRangeSelection を登録

NodeRangeSelection モジュールを Outliner.svelte がインポートすることで `Selection.jsonID` の副作用が走るようにする。

**Files:**

- Modify: `packages/client/src/lib/outliner/Outliner.svelte`

- [ ] **Step 1: import を追加**

`packages/client/src/lib/outliner/Outliner.svelte` の `<script>` 内、既存 import 群の末尾に追加:

```typescript
import './selections/node-range-selection';
```

- [ ] **Step 2: 型チェックと既存テストが通ることを確認**

Run: `vp check && vp test --run packages/client/src/lib/outliner`
Expected: PASS（既存テスト全グリーン、NodeRangeSelection テストもグリーン）

- [ ] **Step 3: コミット**

```bash
git add packages/client/src/lib/outliner/Outliner.svelte
git commit -m "$(cat <<'MSG'
Register NodeRangeSelection in the outliner editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: extendRangeSelectionUp / Down コマンド

**Files:**

- Create: `packages/client/src/lib/outliner/commands/range-select.ts`
- Test: `packages/client/src/lib/outliner/__tests__/range-select.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import {
  exitRangeSelection,
  extendRangeSelectionDown,
  extendRangeSelectionUp,
} from '../commands/range-select';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

function apply(state: EditorState, cmd: (s: EditorState, d?: (tr: any) => void) => boolean) {
  let next: EditorState | null = null;
  const ok = cmd(state, (tr) => {
    next = state.apply(tr);
  });
  return { ok, next };
}

describe('extendRangeSelectionDown', () => {
  it('extends a NodeSelection down by one sibling', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const { ok, next } = apply(state, extendRangeSelectionDown);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
    expect((next!.selection as NodeRangeSelection).headIndex).toBe(1);
  });

  it('extends a NodeRangeSelection further down', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const { next } = apply(state, extendRangeSelectionDown);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(3);
  });

  it('returns false at the last sibling', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 1)),
    });
    expect(extendRangeSelectionDown(state, () => {})).toBe(false);
  });

  it('returns false on TextSelection (falls through)', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(extendRangeSelectionDown(state, () => {})).toBe(false);
  });
});

describe('extendRangeSelectionUp', () => {
  it('extends head up by one', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 2)),
    });
    const { next } = apply(state, extendRangeSelectionUp);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
    expect((next!.selection as NodeRangeSelection).headIndex).toBe(1);
  });

  it('returns false at the first sibling', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    expect(extendRangeSelectionUp(state, () => {})).toBe(false);
  });
});

describe('exitRangeSelection', () => {
  it('converts NodeRangeSelection to TextSelection at end of first item paragraph', () => {
    const doc = makeDoc(['ab', 'cd']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const { ok, next } = apply(state, exitRangeSelection);
    expect(ok).toBe(true);
    expect(next!.selection).toBeInstanceOf(TextSelection);
    expect(next!.selection.from).toBe(itemPos(doc, 0) + 2 + 2);
  });

  it('returns false when selection is already TextSelection', () => {
    const doc = makeDoc(['a']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(exitRangeSelection(state, () => {})).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-select.test.ts`
Expected: FAIL — モジュールが存在しない。

- [ ] **Step 3: 実装**

`packages/client/src/lib/outliner/commands/range-select.ts`:

```typescript
import { type Command, NodeSelection, TextSelection } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function listItemNodeSelection(sel: NodeSelection): boolean {
  return sel.node.type === LIST_ITEM;
}

function siblingItemPos(parent, parentStart: number, index: number): number {
  let pos = parentStart;
  for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
  return pos;
}

function extend(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { selection, doc } = state;
    let anchorIndex: number;
    let headIndex: number;
    let parent;
    let parentStart: number;

    if (isNodeRangeSelection(selection)) {
      parent = selection.parentList;
      parentStart = selection.parentListPos;
      anchorIndex = selection.anchorIndex;
      headIndex = selection.headIndex;
    } else if (selection instanceof NodeSelection && listItemNodeSelection(selection)) {
      const $pos = selection.$from;
      parent = $pos.parent;
      if (parent.type !== BULLET_LIST) return false;
      parentStart = $pos.start();
      anchorIndex = $pos.index();
      headIndex = anchorIndex;
    } else {
      return false;
    }

    const nextHead = headIndex + direction;
    if (nextHead < 0 || nextHead >= parent.childCount) return false;
    if (parent.child(nextHead).type !== LIST_ITEM) return false;

    const anchorPos = siblingItemPos(parent, parentStart, anchorIndex);
    const headPos = siblingItemPos(parent, parentStart, nextHead);
    const sel = new NodeRangeSelection(doc.resolve(anchorPos), doc.resolve(headPos));
    if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
    return true;
  };
}

export const extendRangeSelectionUp = extend(-1);
export const extendRangeSelectionDown = extend(1);

export const exitRangeSelection: Command = (state, dispatch) => {
  const { selection } = state;
  if (!isNodeRangeSelection(selection) && !(selection instanceof NodeSelection)) return false;
  if (selection instanceof NodeSelection && selection.node.type !== LIST_ITEM) return false;

  const firstItemPos = isNodeRangeSelection(selection)
    ? selection.from
    : (selection as NodeSelection).from;
  const item = state.doc.nodeAt(firstItemPos);
  if (!item) return false;
  const paragraph = item.firstChild;
  if (!paragraph) return false;
  const caret = firstItemPos + 2 + paragraph.content.size;
  if (dispatch) {
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, caret)).scrollIntoView());
  }
  return true;
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-select.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/commands/range-select.ts \
        packages/client/src/lib/outliner/__tests__/range-select.test.ts
git commit -m "$(cat <<'MSG'
Add range-select commands for Shift+Arrow and Escape

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: keymap に Shift+Arrow / Escape を結線

**Files:**

- Modify: `packages/client/src/lib/outliner/Outliner.svelte`

- [ ] **Step 1: 既存 keymap に新コマンドを追加**

`packages/client/src/lib/outliner/Outliner.svelte` の `<script>` 部、import に追加:

```typescript
import {
  exitRangeSelection,
  extendRangeSelectionDown,
  extendRangeSelectionUp,
} from './commands/range-select';
```

keymap オブジェクトに追加（既存のキーバインドを保ったまま）:

```typescript
'Shift-ArrowUp': extendRangeSelectionUp,
'Shift-ArrowDown': extendRangeSelectionDown,
Escape: exitRangeSelection,
```

最終的に keymap 部はこの形になる：

```typescript
keymap({
  Enter: splitListItem(outlinerSchema.nodes.list_item),
  Tab: sinkListItem(outlinerSchema.nodes.list_item),
  'Shift-Tab': liftListItem(outlinerSchema.nodes.list_item),
  Backspace: smartBackspace,
  Delete: smartDelete,
  'Mod-z': undo,
  'Mod-Shift-z': redo,
  'Ctrl-y': redo,
  'Mod-ArrowUp': collapseItem,
  'Mod-ArrowDown': expandItem,
  'Mod-Shift-d': duplicateItem,
  'Shift-ArrowUp': extendRangeSelectionUp,
  'Shift-ArrowDown': extendRangeSelectionDown,
  Escape: exitRangeSelection,
  ...(isMac
    ? {
        'Mod-Shift-ArrowUp': moveItemUp,
        'Mod-Shift-ArrowDown': moveItemDown,
      }
    : {
        'Alt-Shift-ArrowUp': moveItemUp,
        'Alt-Shift-ArrowDown': moveItemDown,
      }),
}),
```

- [ ] **Step 2: 型チェックと既存テストが通ることを確認**

Run: `vp check && vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add packages/client/src/lib/outliner/Outliner.svelte
git commit -m "$(cat <<'MSG'
Wire Shift+Arrow range extension and Escape exit into outliner keymap

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: bullet-click を Shift+Click 拡張に対応

**Files:**

- Modify: `packages/client/src/lib/outliner/plugins/bullet-click.ts`

- [ ] **Step 1: 失敗するテストを書く（新規 `__tests__/bullet-click.test.ts`）**

`packages/client/src/lib/outliner/__tests__/bullet-click.test.ts`:

```typescript
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { resolveBulletClickSelection } from '../plugins/bullet-click';
import { NodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('resolveBulletClickSelection', () => {
  it('plain click returns a NodeSelection on the clicked item', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 1), false);
    expect(sel).toBeInstanceOf(NodeSelection);
    expect((sel as NodeSelection).from).toBe(itemPos(doc, 1));
  });

  it('shift+click extends current NodeSelection to a NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, itemPos(doc, 0)),
    });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 2), true);
    expect(sel).toBeInstanceOf(NodeRangeSelection);
    expect((sel as NodeRangeSelection).itemCount).toBe(3);
  });

  it('shift+click extends an existing NodeRangeSelection', () => {
    const doc = makeDoc(['a', 'b', 'c', 'd']);
    const start = NodeSelection.create(doc, itemPos(doc, 0));
    const state = EditorState.create({ doc, selection: start });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 3), true);
    expect((sel as NodeRangeSelection).itemCount).toBe(4);
  });

  it('shift+click without prior NodeSelection falls back to single NodeSelection', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const sel = resolveBulletClickSelection(state, itemPos(doc, 0), true);
    expect(sel).toBeInstanceOf(NodeSelection);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/bullet-click.test.ts`
Expected: FAIL — `resolveBulletClickSelection` 未エクスポート。

- [ ] **Step 3: bullet-click.ts を改修**

`packages/client/src/lib/outliner/plugins/bullet-click.ts`:

```typescript
import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  type Selection,
} from 'prosemirror-state';
import { createNodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

export function resolveBulletClickSelection(
  state: EditorState,
  itemPos: number,
  shift: boolean,
): Selection {
  const single = NodeSelection.create(state.doc, itemPos);
  if (!shift) return single;

  const current = state.selection;
  let anchorItemPos: number | null = null;
  if (isNodeRangeSelection(current)) {
    anchorItemPos = current.from + 0; // first item position
    // Use the anchor side of the range as the anchor; preserve direction.
    anchorItemPos =
      current.anchorIndex <= current.headIndex
        ? current.from
        : current.to - current.parentList.child(current.toIndex).nodeSize;
  } else if (current instanceof NodeSelection && current.node.type === LIST_ITEM) {
    anchorItemPos = current.from;
  }
  if (anchorItemPos === null) return single;

  const range = createNodeRangeSelection(state.doc, anchorItemPos, itemPos);
  return range ?? single;
}

export const bulletClickPlugin = new Plugin({
  key: new PluginKey('nfp-bullet-click'),
  props: {
    handleClickOn(view, _pos, node, nodePos, event, direct) {
      if (!direct) return false;
      if (node.type !== LIST_ITEM) return false;
      const target = event.target as Element | null;
      if (target?.closest('p')) return false;
      const sel = resolveBulletClickSelection(view.state, nodePos, event.shiftKey);
      view.dispatch(view.state.tr.setSelection(sel));
      return true;
    },
  },
});
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/bullet-click.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/plugins/bullet-click.ts \
        packages/client/src/lib/outliner/__tests__/bullet-click.test.ts
git commit -m "$(cat <<'MSG'
Extend bullet click handler with Shift+Click range selection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: 範囲ハイライト Decoration plugin

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/range-selection-decorations.ts`
- Modify: `packages/client/src/lib/outliner/Outliner.svelte`

- [ ] **Step 1: 失敗するテストを書く**

`packages/client/src/lib/outliner/__tests__/range-decorations.test.ts`:

```typescript
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { rangeSelectionDecorations } from '../plugins/range-selection-decorations';
import { createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('rangeSelectionDecorations', () => {
  it('produces no decorations when no NodeRangeSelection is active', () => {
    const doc = makeDoc(['a', 'b']);
    const state = EditorState.create({ doc, plugins: [rangeSelectionDecorations] });
    const set = rangeSelectionDecorations.props.decorations!(state);
    expect(set?.find().length ?? 0).toBe(0);
  });

  it('adds a data-range-selected="true" decoration to each item in the range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel, plugins: [rangeSelectionDecorations] });
    const set = rangeSelectionDecorations.props.decorations!(state);
    const decos = set!.find();
    expect(decos.length).toBe(2);
    for (const d of decos) {
      expect((d as any).type.attrs['data-range-selected']).toBe('true');
    }
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-decorations.test.ts`
Expected: FAIL — モジュールが無い。

- [ ] **Step 3: プラグイン実装**

`packages/client/src/lib/outliner/plugins/range-selection-decorations.ts`:

```typescript
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isNodeRangeSelection } from '../selections/node-range-selection';

export const rangeSelectionDecorations = new Plugin({
  key: new PluginKey('nfp-range-selection-decorations'),
  props: {
    decorations(state) {
      const sel = state.selection;
      if (!isNodeRangeSelection(sel)) return DecorationSet.empty;
      const decorations: Decoration[] = [];
      sel.forEachItem((pos, node) => {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { 'data-range-selected': 'true' }),
        );
      });
      return DecorationSet.create(state.doc, decorations);
    },
  },
});
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-decorations.test.ts`
Expected: PASS（2 件）

- [ ] **Step 5: Outliner.svelte に plugin を追加**

`packages/client/src/lib/outliner/Outliner.svelte` の `<script>` 内:

```typescript
import { rangeSelectionDecorations } from './plugins/range-selection-decorations';
```

`plugins:` 配列に `rangeSelectionDecorations` を追加（`separatorDecorations` の後ろ）:

```typescript
plugins: [
  history(),
  keymap({ ... }),
  keymap(baseKeymap),
  pasteHandler,
  clipboardPlugin,
  bulletClickPlugin,
  separatorDecorations,
  rangeSelectionDecorations,
],
```

`<style>` ブロックに CSS を追記:

```css
.outliner-root :global(li[data-range-selected='true']) {
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  border-radius: 4px;
}
```

- [ ] **Step 6: 型チェックと全体テストが通ることを確認**

Run: `vp check && vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/client/src/lib/outliner/plugins/range-selection-decorations.ts \
        packages/client/src/lib/outliner/__tests__/range-decorations.test.ts \
        packages/client/src/lib/outliner/Outliner.svelte
git commit -m "$(cat <<'MSG'
Highlight NodeRangeSelection with li decoration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: moveItemUp/Down を範囲対応

**Files:**

- Modify: `packages/client/src/lib/outliner/commands/move.ts`
- Test: `packages/client/src/lib/outliner/__tests__/range-commands.test.ts` (new)

- [ ] **Step 1: 失敗するテストを書く**

`packages/client/src/lib/outliner/__tests__/range-commands.test.ts`:

```typescript
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { duplicateItem } from '../commands/duplicate';
import { collapseItem, expandItem } from '../commands/fold';
import { moveItemDown, moveItemUp } from '../commands/move';
import { smartBackspace } from '../commands/backspace';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

function topTexts(state: EditorState) {
  const list = state.doc.firstChild!;
  const out: string[] = [];
  list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
  return out;
}

function makeRangeState(texts: string[], fromIdx: number, toIdx: number) {
  const doc = makeDoc(texts);
  const sel = createNodeRangeSelection(doc, itemPos(doc, fromIdx), itemPos(doc, toIdx))!;
  return EditorState.create({ doc, selection: sel });
}

describe('moveItemUp on a NodeRangeSelection', () => {
  it('moves the whole range up by one', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(moveItemUp(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['b', 'c', 'a', 'd']);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });

  it('returns false at the top boundary', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    expect(moveItemUp(state, () => {})).toBe(false);
  });
});

describe('moveItemDown on a NodeRangeSelection', () => {
  it('moves the whole range down by one', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(moveItemDown(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a', 'd', 'b', 'c']);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });

  it('returns false at the bottom boundary', () => {
    const state = makeRangeState(['a', 'b', 'c'], 1, 2);
    expect(moveItemDown(state, () => {})).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL — moveItemUp/Down が range 対応していない（NodeRangeSelection の $from 構造で `findListItemDepth` が見つけられないため false）。

- [ ] **Step 3: move.ts を改修**

`packages/client/src/lib/outliner/commands/move.ts` を以下に書き換える（既存ロジックを保ちつつ範囲分岐を先頭に追加）:

```typescript
import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

function moveRange(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    const parent = sel.parentList;
    if (parent.type !== BULLET_LIST) return false;
    const targetIndex = direction === -1 ? sel.fromIndex - 1 : sel.toIndex + 1;
    if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

    const sibling = parent.child(targetIndex);
    const sliceContent: Node[] = [];
    sel.forEachItem((_pos, n) => sliceContent.push(n));
    const rangeStart = sel.from;
    const rangeEnd = sel.to;
    const siblingPos = direction === -1 ? rangeStart - sibling.nodeSize : rangeEnd;
    const replaceFrom = Math.min(rangeStart, siblingPos);
    const replaceTo =
      rangeEnd +
      (direction === 1 ? sibling.nodeSize : 0) -
      0 +
      (direction === -1 ? -sibling.nodeSize + sibling.nodeSize : 0); // computed below explicitly
    // Compute replaceTo explicitly:
    const replaceToFinal = direction === -1 ? rangeEnd : siblingPos + sibling.nodeSize;
    const replacement = direction === -1 ? [...sliceContent, sibling] : [sibling, ...sliceContent];

    const tr = state.tr.replaceWith(replaceFrom, replaceToFinal, Fragment.fromArray(replacement));

    const newRangeStart = direction === -1 ? replaceFrom : replaceFrom + sibling.nodeSize;
    const newRangeEnd = newRangeStart + sliceContent.reduce((s, n) => s + n.nodeSize, 0);
    const anchorPos =
      sel.anchorIndex <= sel.headIndex
        ? newRangeStart
        : newRangeEnd - sliceContent[sliceContent.length - 1].nodeSize;
    const headPos =
      sel.anchorIndex <= sel.headIndex
        ? newRangeEnd - sliceContent[sliceContent.length - 1].nodeSize
        : newRangeStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function moveSingle(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findListItemDepth($from);
    if (depth === null) return false;
    const item = $from.node(depth);
    const parentList = $from.node(depth - 1);
    if (parentList.type !== BULLET_LIST) return false;
    const indexInList = $from.index(depth - 1);
    const targetIndex = indexInList + direction;
    if (targetIndex < 0 || targetIndex >= parentList.childCount) return false;
    const sibling = parentList.child(targetIndex);

    const itemStart = $from.before(depth);
    const siblingStart =
      direction === -1 ? itemStart - sibling.nodeSize : itemStart + item.nodeSize;
    const rangeStart = Math.min(itemStart, siblingStart);
    const rangeEnd = rangeStart + item.nodeSize + sibling.nodeSize;
    const replacement = direction === -1 ? [item, sibling] : [sibling, item];

    const tr = state.tr.replaceWith(rangeStart, rangeEnd, Fragment.fromArray(replacement));
    const caretOffset = $from.pos - itemStart;
    const newItemStart = direction === -1 ? rangeStart : rangeStart + sibling.nodeSize;
    try {
      tr.setSelection(TextSelection.near(tr.doc.resolve(newItemStart + caretOffset)));
    } catch {
      // caret remap best-effort; ignore if pos invalid
    }
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function move(direction: -1 | 1): Command {
  return (state, dispatch) => {
    if (isNodeRangeSelection(state.selection)) {
      return moveRange(direction)(state, dispatch);
    }
    return moveSingle(direction)(state, dispatch);
  };
}

export const moveItemUp = move(-1);
export const moveItemDown = move(1);
```

簡略化のため `replaceTo` 計算を単純化したバージョン:

```typescript
function moveRange(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    const parent = sel.parentList;
    if (parent.type !== BULLET_LIST) return false;
    const targetIndex = direction === -1 ? sel.fromIndex - 1 : sel.toIndex + 1;
    if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

    const sibling = parent.child(targetIndex);
    const items: Node[] = [];
    sel.forEachItem((_p, n) => items.push(n));

    const rangeStart = sel.from;
    const rangeEnd = sel.to;
    const replaceFrom = direction === -1 ? rangeStart - sibling.nodeSize : rangeStart;
    const replaceTo = direction === -1 ? rangeEnd : rangeEnd + sibling.nodeSize;
    const replacement = direction === -1 ? [...items, sibling] : [sibling, ...items];

    const tr = state.tr.replaceWith(replaceFrom, replaceTo, Fragment.fromArray(replacement));

    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const newRangeStart = direction === -1 ? replaceFrom : replaceFrom + sibling.nodeSize;
    const lastItemSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const anchorPos = forward ? newRangeStart : newRangeStart + itemsSize - lastItemSize;
    const headPos = forward ? newRangeStart + itemsSize - lastItemSize : newRangeStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}
```

**実装時は上記の "簡略化バージョン" を採用する** — 最初に書いた式は冗長なので捨てる。最終形:

```typescript
import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

function moveRange(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!isNodeRangeSelection(sel)) return false;
    if (sel.parentList.type !== BULLET_LIST) return false;
    const targetIndex = direction === -1 ? sel.fromIndex - 1 : sel.toIndex + 1;
    if (targetIndex < 0 || targetIndex >= sel.parentList.childCount) return false;

    const sibling = sel.parentList.child(targetIndex);
    const items: Node[] = [];
    sel.forEachItem((_p, n) => items.push(n));

    const rangeStart = sel.from;
    const rangeEnd = sel.to;
    const replaceFrom = direction === -1 ? rangeStart - sibling.nodeSize : rangeStart;
    const replaceTo = direction === -1 ? rangeEnd : rangeEnd + sibling.nodeSize;
    const replacement = direction === -1 ? [...items, sibling] : [sibling, ...items];

    const tr = state.tr.replaceWith(replaceFrom, replaceTo, Fragment.fromArray(replacement));

    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const newRangeStart = direction === -1 ? replaceFrom : replaceFrom + sibling.nodeSize;
    const lastSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const anchorPos = forward ? newRangeStart : newRangeStart + itemsSize - lastSize;
    const headPos = forward ? newRangeStart + itemsSize - lastSize : newRangeStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function moveSingle(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const depth = findListItemDepth($from);
    if (depth === null) return false;
    const item = $from.node(depth);
    const parentList = $from.node(depth - 1);
    if (parentList.type !== BULLET_LIST) return false;
    const indexInList = $from.index(depth - 1);
    const targetIndex = indexInList + direction;
    if (targetIndex < 0 || targetIndex >= parentList.childCount) return false;
    const sibling = parentList.child(targetIndex);

    const itemStart = $from.before(depth);
    const siblingStart =
      direction === -1 ? itemStart - sibling.nodeSize : itemStart + item.nodeSize;
    const rangeStart = Math.min(itemStart, siblingStart);
    const rangeEnd = rangeStart + item.nodeSize + sibling.nodeSize;
    const replacement = direction === -1 ? [item, sibling] : [sibling, item];

    const tr = state.tr.replaceWith(rangeStart, rangeEnd, Fragment.fromArray(replacement));
    const caretOffset = $from.pos - itemStart;
    const newItemStart = direction === -1 ? rangeStart : rangeStart + sibling.nodeSize;
    try {
      tr.setSelection(TextSelection.near(tr.doc.resolve(newItemStart + caretOffset)));
    } catch {
      // caret remap best-effort; ignore if pos invalid
    }
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function move(direction: -1 | 1): Command {
  return (state, dispatch) => {
    if (isNodeRangeSelection(state.selection)) return moveRange(direction)(state, dispatch);
    return moveSingle(direction)(state, dispatch);
  };
}

export const moveItemUp = move(-1);
export const moveItemDown = move(1);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner`
Expected: 既存 `commands.test.ts` グリーン、`range-commands.test.ts` の move 系 4 件もグリーン。

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/commands/move.ts \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Support NodeRangeSelection in moveItemUp/Down

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 9: duplicateItem を範囲対応

**Files:**

- Modify: `packages/client/src/lib/outliner/commands/duplicate.ts`
- Test: extend `range-commands.test.ts`

- [ ] **Step 1: テストを追加**

`range-commands.test.ts` の末尾に追加:

```typescript
describe('duplicateItem on a NodeRangeSelection', () => {
  it('clones the selected range and inserts it right after the range', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(duplicateItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a', 'b', 'a', 'b', 'c']);
    expect(next!.selection).toBeInstanceOf(NodeRangeSelection);
    expect((next!.selection as NodeRangeSelection).itemCount).toBe(2);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL — duplicateItem が NodeRangeSelection を扱わない（単一要素しか duplicate しない）。

- [ ] **Step 3: duplicate.ts を改修**

`packages/client/src/lib/outliner/commands/duplicate.ts`:

```typescript
import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model';
import { type Command } from 'prosemirror-state';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

export const duplicateItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (isNodeRangeSelection(sel)) {
    const items: Node[] = [];
    sel.forEachItem((_p, n) => items.push(n.copy(n.content)));
    const insertPos = sel.to;
    const tr = state.tr.insert(insertPos, Fragment.fromArray(items));
    const newStart = insertPos;
    const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
    const lastSize = items[items.length - 1].nodeSize;
    const forward = sel.anchorIndex <= sel.headIndex;
    const anchorPos = forward ? newStart : newStart + itemsSize - lastSize;
    const headPos = forward ? newStart + itemsSize - lastSize : newStart;
    tr.setSelection(new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }

  const { $from } = sel;
  const depth = findListItemDepth($from);
  if (depth === null) return false;
  const item = $from.node(depth);
  const after = $from.after(depth);
  const tr = state.tr.insert(after, item.copy(item.content));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/commands/duplicate.ts \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Support NodeRangeSelection in duplicateItem

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 10: collapseItem / expandItem を範囲対応

**Files:**

- Modify: `packages/client/src/lib/outliner/commands/fold.ts`
- Test: extend `range-commands.test.ts`

- [ ] **Step 1: テストを追加**

`range-commands.test.ts` の末尾に追加:

```typescript
function makeNestedDoc() {
  // - a
  //   - a1
  // - b
  //   - b1
  // - c (no children)
  const make = (text: string, children?: any[]) => {
    const kids = [outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])];
    if (children) kids.push(outlinerSchema.node('bullet_list', null, children));
    return outlinerSchema.node('list_item', null, kids);
  };
  return outlinerSchema.node('doc', null, [
    outlinerSchema.node('bullet_list', null, [
      make('a', [make('a1')]),
      make('b', [make('b1')]),
      make('c'),
    ]),
  ]);
}

describe('collapseItem on a NodeRangeSelection', () => {
  it('sets collapsed=true on every item with children', () => {
    const doc = makeNestedDoc();
    const sel = createNodeRangeSelection(
      doc,
      1,
      1 + doc.firstChild!.child(0).nodeSize + doc.firstChild!.child(1).nodeSize,
    )!;
    // Range covers items 0 and 2 (skipping index 1) — adjust to cover [0,2]
    const range = createNodeRangeSelection(
      doc,
      1,
      1 + doc.firstChild!.child(0).nodeSize + doc.firstChild!.child(1).nodeSize,
    )!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(collapseItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    expect(list.child(0).attrs.collapsed).toBe(true);
    expect(list.child(1).attrs.collapsed).toBe(true);
    expect(list.child(2).attrs.collapsed).toBe(false); // no children → skipped
  });
});

describe('expandItem on a NodeRangeSelection', () => {
  it('clears collapsed on items with children', () => {
    // Start with both a and b collapsed
    const make = (text: string, collapsed: boolean, children?: any[]) => {
      const kids = [outlinerSchema.node('paragraph', null, [outlinerSchema.text(text)])];
      if (children) kids.push(outlinerSchema.node('bullet_list', null, children));
      return outlinerSchema.node('list_item', { collapsed }, kids);
    };
    const child = (t: string) =>
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text(t)]),
      ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        make('a', true, [child('a1')]),
        make('b', true, [child('b1')]),
      ]),
    ]);
    const range = createNodeRangeSelection(doc, 1, 1 + doc.firstChild!.child(0).nodeSize)!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(expandItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(next!.doc.firstChild!.child(0).attrs.collapsed).toBe(false);
    expect(next!.doc.firstChild!.child(1).attrs.collapsed).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: fold.ts を改修**

`packages/client/src/lib/outliner/commands/fold.ts`:

```typescript
import { type Command, type Transaction } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function setCollapsed(value: boolean): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (isNodeRangeSelection(sel)) {
      let tr: Transaction | null = null;
      sel.forEachItem((pos, node) => {
        const hasChildList = node.lastChild?.type === BULLET_LIST;
        if (!hasChildList) return;
        if (!tr) tr = state.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
      });
      if (!tr) return false;
      if (dispatch) dispatch(tr);
      return true;
    }

    const { $from } = sel;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type !== LIST_ITEM) depth--;
    if (depth === 0) return false;
    const pos = $from.before(depth);
    const node = $from.node(depth);
    const hasChildList = node.lastChild?.type === BULLET_LIST;
    if (!hasChildList) return false;
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: value });
    if (dispatch) dispatch(tr);
    return true;
  };
}

export const collapseItem = setCollapsed(true);
export const expandItem = setCollapsed(false);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/commands/fold.ts \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Support NodeRangeSelection in collapseItem/expandItem

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 11: smartBackspace / smartDelete を範囲対応

**Files:**

- Modify: `packages/client/src/lib/outliner/commands/backspace.ts`
- Test: extend `range-commands.test.ts`

- [ ] **Step 1: テストを追加**

`range-commands.test.ts` の末尾に追加:

```typescript
import { smartDelete } from '../commands/backspace';

describe('smartBackspace on a NodeRangeSelection', () => {
  it('deletes the entire range and leaves caret as TextSelection', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(smartBackspace(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['c']);
  });

  it('replaces the only items with an empty list_item if range covers all', () => {
    const state = makeRangeState(['a', 'b'], 0, 1);
    let next: EditorState | null = null;
    expect(smartBackspace(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    expect(list.type.name).toBe('bullet_list');
    expect(list.childCount).toBe(1);
    expect(list.child(0).firstChild?.textContent).toBe('');
  });
});

describe('smartDelete on a NodeRangeSelection', () => {
  it('behaves identically to smartBackspace on a range', () => {
    const state = makeRangeState(['a', 'b', 'c'], 1, 2);
    let next: EditorState | null = null;
    expect(smartDelete(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: backspace.ts を改修**

`packages/client/src/lib/outliner/commands/backspace.ts` の冒頭に range 分岐を追加（既存ロジックは保つ）:

```typescript
import type { Node, ResolvedPos } from 'prosemirror-model';
import { liftListItem } from 'prosemirror-schema-list';
import { type Command, TextSelection } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

function findListItemDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type !== LIST_ITEM) depth--;
  return depth === 0 ? null : depth;
}

function isItemEmpty(item: Node): boolean {
  return (
    item.childCount === 1 &&
    item.firstChild!.type === outlinerSchema.nodes.paragraph &&
    item.firstChild!.content.size === 0
  );
}

function deleteRange(state: Parameters<Command>[0], dispatch: Parameters<Command>[1]): boolean {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const parent = sel.parentList;
  const tr = state.tr.delete(sel.from, sel.to);

  // If the parent list became empty, insert a single empty list_item to keep the schema valid.
  const parentPosBefore = sel.parentListPos - 1; // start of parent's content is parentListPos
  let caretPos: number;
  if (parent.childCount === sel.itemCount) {
    const emptyItem = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, []),
    ]);
    tr.insert(sel.parentListPos, emptyItem);
    caretPos = sel.parentListPos + 2; // inside the new empty paragraph
  } else {
    // caret to position of next sibling's paragraph start (or previous if at end)
    const survivingPos =
      sel.fromIndex < parent.childCount - sel.itemCount ? sel.from : sel.from - 1;
    caretPos = Math.max(1, survivingPos + 1);
  }
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(caretPos)));
  } catch {
    // best effort
  }
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

export const smartBackspace: Command = (state, dispatch) => {
  if (isNodeRangeSelection(state.selection)) return deleteRange(state, dispatch);

  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === outlinerSchema.nodes.paragraph;
  if (!inParagraph || $from.parentOffset !== 0) return false;
  if (item.firstChild !== $from.parent) return false;

  const parentList = $from.node(itemDepth - 1);
  if (parentList.type !== BULLET_LIST) return false;
  const indexInList = $from.index(itemDepth - 1);
  const itemStart = $from.before(itemDepth);

  if (isItemEmpty(item)) {
    if (indexInList === 0) return false;
    const prevItem = parentList.child(indexInList - 1);
    const prevItemStart = itemStart - prevItem.nodeSize;
    const prevPara = prevItem.firstChild!;
    const caret = prevItemStart + 2 + prevPara.content.size;
    const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, caret));
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  }

  if (indexInList === 0) {
    return liftListItem(LIST_ITEM)(state, dispatch);
  }

  const prevItem = parentList.child(indexInList - 1);
  const prevItemStart = itemStart - prevItem.nodeSize;
  const prevPara = prevItem.firstChild!;
  const insertPos = prevItemStart + 2 + prevPara.content.size;
  const currentParaContent = item.firstChild!.content;

  const tr = state.tr.delete(itemStart, itemStart + item.nodeSize);
  tr.insert(insertPos, currentParaContent);
  tr.setSelection(TextSelection.create(tr.doc, insertPos));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

export const smartDelete: Command = (state, dispatch) => {
  if (isNodeRangeSelection(state.selection)) return deleteRange(state, dispatch);

  const { $from, empty } = state.selection;
  if (!empty) return false;
  const itemDepth = findListItemDepth($from);
  if (itemDepth === null) return false;
  const item = $from.node(itemDepth);

  const inParagraph = $from.parent.type === outlinerSchema.nodes.paragraph;
  if (!inParagraph) return false;
  if (item.lastChild !== $from.parent) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;

  const parentList = $from.node(itemDepth - 1);
  if (parentList.type !== BULLET_LIST) return false;
  const indexInList = $from.index(itemDepth - 1);
  if (indexInList >= parentList.childCount - 1) return false;

  const itemStart = $from.before(itemDepth);
  const itemEnd = itemStart + item.nodeSize;
  const nextItem = parentList.child(indexInList + 1);
  const nextParaContent = nextItem.firstChild!.content;

  const caret = $from.pos;
  const tr = state.tr.delete(itemEnd, itemEnd + nextItem.nodeSize);
  tr.insert(caret, nextParaContent);
  tr.setSelection(TextSelection.create(tr.doc, caret));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/client/src/lib/outliner/commands/backspace.ts \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Delete entire range on Backspace/Delete with NodeRangeSelection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 12: Tab / Shift-Tab を範囲対応

`prosemirror-schema-list` の `sinkListItem` / `liftListItem` は `$from.blockRange($to)` を見るので、NodeRangeSelection の `$from`/`$to` でも動く可能性がある。動かないケース（範囲先頭から末尾の paragraph で TextSelection を作って再実行する fallback）を実装する。

**Files:**

- Modify: `packages/client/src/lib/outliner/Outliner.svelte` (keymap で wrap)
- Create: `packages/client/src/lib/outliner/commands/range-indent.ts`
- Test: extend `range-commands.test.ts`

- [ ] **Step 1: テストを追加**

`range-commands.test.ts` の末尾に追加:

```typescript
import { rangeAwareLiftListItem, rangeAwareSinkListItem } from '../commands/range-indent';

describe('rangeAwareSinkListItem (Tab)', () => {
  it('indents every item in the range under the previous sibling', () => {
    const state = makeRangeState(['a', 'b', 'c', 'd'], 1, 2);
    let next: EditorState | null = null;
    expect(rangeAwareSinkListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    // expected: - a / - a > [b, c] / - d ... structure shape depends on schema-list
    // Just assert top-level count reduced by 2 (b and c moved under a)
    expect(list.childCount).toBe(2);
    expect(list.child(0).firstChild?.textContent).toBe('a');
    expect(list.child(1).firstChild?.textContent).toBe('d');
    const nested = list.child(0).lastChild!;
    expect(nested.type.name).toBe('bullet_list');
    expect(nested.childCount).toBe(2);
  });

  it('returns false if no previous sibling exists', () => {
    const state = makeRangeState(['a', 'b'], 0, 1);
    expect(rangeAwareSinkListItem(state, () => {})).toBe(false);
  });
});

describe('rangeAwareLiftListItem (Shift-Tab)', () => {
  it('outdents nested range back to the parent list', () => {
    // - a
    //   - b
    //   - c
    // - d
    const sub = ['b', 'c'].map((t) =>
      outlinerSchema.node('list_item', null, [
        outlinerSchema.node('paragraph', null, [outlinerSchema.text(t)]),
      ]),
    );
    const a = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('a')]),
      outlinerSchema.node('bullet_list', null, sub),
    ]);
    const d = outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, [outlinerSchema.text('d')]),
    ]);
    const doc = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [a, d]),
    ]);
    // Compute positions of b and c (inside a's nested list)
    const aStart = 1; // before a
    const innerListStart = aStart + 1 /* into a */ + a.firstChild!.nodeSize; // inside a > after paragraph
    const bPos = innerListStart + 1;
    const cPos = bPos + sub[0].nodeSize;
    const range = createNodeRangeSelection(doc, bPos, cPos)!;
    const state = EditorState.create({ doc, selection: range });
    let next: EditorState | null = null;
    expect(rangeAwareLiftListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    const list = next!.doc.firstChild!;
    // After lift, b and c become top-level siblings.
    expect(list.childCount).toBe(4);
    expect(list.child(0).firstChild?.textContent).toBe('a');
    expect(list.child(1).firstChild?.textContent).toBe('b');
    expect(list.child(2).firstChild?.textContent).toBe('c');
    expect(list.child(3).firstChild?.textContent).toBe('d');
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL — モジュール未作成。

- [ ] **Step 3: 実装**

`packages/client/src/lib/outliner/commands/range-indent.ts`:

```typescript
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { type Command, TextSelection } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

const LIST_ITEM = outlinerSchema.nodes.list_item;

function withTextSelectionOverRange(state: Parameters<Command>[0]): Parameters<Command>[0] {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return state;
  // Build a TextSelection spanning first item paragraph start → last item paragraph end.
  const list = sel.parentList;
  let pos = sel.parentListPos;
  for (let i = 0; i < sel.fromIndex; i++) pos += list.child(i).nodeSize;
  const firstItem = list.child(sel.fromIndex);
  const fromTextPos = pos + 2; // inside paragraph
  let lastPos = pos;
  for (let i = sel.fromIndex; i <= sel.toIndex; i++) lastPos += list.child(i).nodeSize;
  const lastItem = list.child(sel.toIndex);
  const lastPara = lastItem.firstChild!;
  // position at end of last item's paragraph
  const lastParaEnd = lastPos - lastItem.nodeSize + 2 + lastPara.content.size;
  const $from = state.doc.resolve(fromTextPos);
  const $to = state.doc.resolve(lastParaEnd);
  return state.apply(state.tr.setSelection(TextSelection.between($from, $to)));
}

export const rangeAwareSinkListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return sinkListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};

export const rangeAwareLiftListItem: Command = (state, dispatch) => {
  const base = withTextSelectionOverRange(state);
  return liftListItem(LIST_ITEM)(base, dispatch ? (tr) => dispatch!(tr) : undefined);
};
```

- [ ] **Step 4: keymap を更新**

`Outliner.svelte` の import を更新:

```typescript
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { rangeAwareLiftListItem, rangeAwareSinkListItem } from './commands/range-indent';
```

keymap:

```typescript
Tab: rangeAwareSinkListItem,
'Shift-Tab': rangeAwareLiftListItem,
```

非 range のケースに備え、command 内部で `withTextSelectionOverRange` が非 range には何もせず `state` を返すので、既存 TextSelection の動作は維持される。

- [ ] **Step 5: テストが通ることを確認**

Run: `vp check && vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/outliner/commands/range-indent.ts \
        packages/client/src/lib/outliner/Outliner.svelte \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Range-aware Tab/Shift-Tab via TextSelection bridge

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 13: Enter (splitListItem) を範囲時に範囲削除へリダイレクト

`splitListItem` は TextSelection 想定なので、NodeRangeSelection 中の Enter は「範囲削除→空 item を挿入→TextSelection」にする。

**Files:**

- Create: `packages/client/src/lib/outliner/commands/range-split.ts`
- Modify: `packages/client/src/lib/outliner/Outliner.svelte`
- Test: extend `range-commands.test.ts`

- [ ] **Step 1: テストを追加**

```typescript
import { rangeAwareSplitListItem } from '../commands/range-split';

describe('rangeAwareSplitListItem (Enter)', () => {
  it('deletes the range and leaves a single empty item with TextSelection at start', () => {
    const state = makeRangeState(['a', 'b', 'c'], 0, 1);
    let next: EditorState | null = null;
    expect(rangeAwareSplitListItem(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(topTexts(next!)).toEqual(['', 'c']);
  });

  it('falls through to default splitListItem when not a NodeRangeSelection', () => {
    // ensure command returns false so default Enter handler can run
    const doc = makeDoc(['ab']);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(rangeAwareSplitListItem(state, () => {})).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`packages/client/src/lib/outliner/commands/range-split.ts`:

```typescript
import { type Command, TextSelection } from 'prosemirror-state';
import { isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

export const rangeAwareSplitListItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return false;
  const empty = outlinerSchema.node('list_item', null, [
    outlinerSchema.node('paragraph', null, []),
  ]);
  const tr = state.tr.replaceWith(sel.from, sel.to, empty);
  // caret inside the new empty paragraph
  const caret = sel.from + 2;
  tr.setSelection(TextSelection.create(tr.doc, caret));
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};
```

- [ ] **Step 4: keymap 更新**

`Outliner.svelte`:

```typescript
import { rangeAwareSplitListItem } from './commands/range-split';
```

keymap で Enter を chainCommands 相当に。簡単のため:

```typescript
Enter: (state, dispatch, view) =>
  rangeAwareSplitListItem(state, dispatch, view) ||
  splitListItem(outlinerSchema.nodes.list_item)(state, dispatch, view),
```

- [ ] **Step 5: テストが通ることを確認**

Run: `vp check && vp test --run packages/client/src/lib/outliner`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/client/src/lib/outliner/commands/range-split.ts \
        packages/client/src/lib/outliner/Outliner.svelte \
        packages/client/src/lib/outliner/__tests__/range-commands.test.ts
git commit -m "$(cat <<'MSG'
Replace range with a single empty item on Enter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 14: Clipboard で NodeRangeSelection の copy/cut/paste を確認

`selection.content()` ベースで動くはずだが、INTERNAL_MIME の round-trip 検証を追加する。

**Files:**

- Test: `packages/client/src/lib/outliner/__tests__/range-clipboard.test.ts` (new)

- [ ] **Step 1: テストを書く**

```typescript
import { Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { sliceToIndentedText } from '../plugins/clipboard';
import { createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('NodeRangeSelection clipboard', () => {
  it('selection.content() returns a usable Slice for INTERNAL_MIME round-trip', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const slice = state.selection.content();
    const json = slice.toJSON();
    expect(json).toBeTruthy();
    const restored = Slice.fromJSON(outlinerSchema, json);
    expect(restored.content.childCount).toBe(2);
    expect(restored.content.child(0).firstChild?.textContent).toBe('a');
  });

  it('sliceToIndentedText serializes a NodeRangeSelection slice', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    expect(sliceToIndentedText(state.selection.content())).toBe('- a\n- b');
  });

  it('paste of the same slice into an empty paragraph replaces with the range items', () => {
    const doc = makeDoc(['a', 'b']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const slice = state.selection.content();
    // Apply replaceSelection at a TextSelection inside the first paragraph
    const empty = outlinerSchema.node('doc', null, [
      outlinerSchema.node('bullet_list', null, [
        outlinerSchema.node('list_item', null, [outlinerSchema.node('paragraph', null, [])]),
      ]),
    ]);
    const target = EditorState.create({ doc: empty });
    const tr = target.tr.replaceSelection(slice);
    const next = target.apply(tr);
    const list = next.doc.firstChild!;
    // first empty item becomes 'a'; new sibling 'b' added
    expect(list.childCount).toBe(2);
    expect(list.child(0).firstChild?.textContent).toBe('a');
    expect(list.child(1).firstChild?.textContent).toBe('b');
  });
});
```

- [ ] **Step 2: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/range-clipboard.test.ts`
Expected: PASS（3 件）— 実装変更不要、`content()` の挙動確認のみ。

- [ ] **Step 3: コミット**

```bash
git add packages/client/src/lib/outliner/__tests__/range-clipboard.test.ts
git commit -m "$(cat <<'MSG'
Cover NodeRangeSelection clipboard round-trip

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 15: bullet-drag プラグイン（ロジック単体）

ロジック関数 `computeDropPosition` を抽出してテスト可能にし、その上で DOM プラグインを組む。

**Files:**

- Create: `packages/client/src/lib/outliner/plugins/bullet-drag.ts`
- Test: `packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts`

- [ ] **Step 1: ロジック関数のテストを書く**

```typescript
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vite-plus/test';
import { computeDropPosition, moveRangeTo } from '../plugins/bullet-drag';
import { NodeRangeSelection, createNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';

function makeDoc(texts: string[]) {
  const items = texts.map((t) =>
    outlinerSchema.node('list_item', null, [
      outlinerSchema.node('paragraph', null, t ? [outlinerSchema.text(t)] : []),
    ]),
  );
  return outlinerSchema.node('doc', null, [outlinerSchema.node('bullet_list', null, items)]);
}

function itemPos(doc: ReturnType<typeof makeDoc>, index: number) {
  let pos = 1;
  const list = doc.firstChild!;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

describe('computeDropPosition', () => {
  it('snaps to before/after the hovered item based on half height', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const list = doc.firstChild!;
    // Cursor over item 1 upper half → drop before item 1
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 2,
        sourceToIndex: 2,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 1),
        hoverItem: list.child(1),
        relativeY: 0.3, // upper half
      }),
    ).toBe(itemPos(doc, 1));

    // Lower half → drop after item 1
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 2,
        sourceToIndex: 2,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 1),
        hoverItem: list.child(1),
        relativeY: 0.7,
      }),
    ).toBe(itemPos(doc, 1) + list.child(1).nodeSize);
  });

  it('returns null when drop would be inside the source range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const list = doc.firstChild!;
    expect(
      computeDropPosition({
        doc,
        sourceFromIndex: 0,
        sourceToIndex: 1,
        sourceDepth: 1,
        hoverItemPos: itemPos(doc, 0),
        hoverItem: list.child(0),
        relativeY: 0.7, // after item 0 = inside range
      }),
    ).toBeNull();
  });
});

describe('moveRangeTo', () => {
  it('moves a single item down past one sibling', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 0))!;
    const state = EditorState.create({ doc, selection: sel });
    const dropPos = itemPos(doc, 2) + doc.firstChild!.child(2).nodeSize; // after c
    const tr = moveRangeTo(state, dropPos);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    const list = next.doc.firstChild!;
    const out: string[] = [];
    list.forEach((it) => out.push(it.firstChild?.textContent ?? ''));
    expect(out).toEqual(['b', 'c', 'a']);
    expect(next.selection).toBeInstanceOf(NodeRangeSelection);
  });

  it('returns null if drop pos is inside source range', () => {
    const doc = makeDoc(['a', 'b', 'c']);
    const sel = createNodeRangeSelection(doc, itemPos(doc, 0), itemPos(doc, 1))!;
    const state = EditorState.create({ doc, selection: sel });
    const dropPos = itemPos(doc, 1); // inside [0..1]
    expect(moveRangeTo(state, dropPos)).toBeNull();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts`
Expected: FAIL — モジュール未作成。

- [ ] **Step 3: bullet-drag.ts を実装**

`packages/client/src/lib/outliner/plugins/bullet-drag.ts`:

```typescript
import { Fragment, type Node } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { NodeRangeSelection, isNodeRangeSelection } from '../selections/node-range-selection';
import { outlinerSchema } from '../schema';
import { resolveBulletClickSelection } from './bullet-click';

const LIST_ITEM = outlinerSchema.nodes.list_item;
const BULLET_LIST = outlinerSchema.nodes.bullet_list;

export interface ComputeDropPositionInput {
  doc: Node;
  sourceFromIndex: number;
  sourceToIndex: number;
  sourceDepth: number;
  hoverItemPos: number;
  hoverItem: Node;
  relativeY: number; // 0..1 within the item element
}

export function computeDropPosition(input: ComputeDropPositionInput): number | null {
  const dropPos =
    input.relativeY < 0.5 ? input.hoverItemPos : input.hoverItemPos + input.hoverItem.nodeSize;
  // Translate dropPos to an index in the same parent list to detect "inside source".
  // We only allow drop at same-parent boundaries.
  try {
    const $pos = input.doc.resolve(dropPos);
    if ($pos.depth !== input.sourceDepth) return null;
    const idx = $pos.index($pos.depth);
    if (idx > input.sourceFromIndex && idx <= input.sourceToIndex) return null;
    if (idx === input.sourceFromIndex || idx === input.sourceToIndex + 1) {
      // adjacent — same as no-op (drop at start or end of source) → reject
      // We'll treat sourceFromIndex (drop at start of source) and sourceToIndex+1 (right after source) as no-ops.
      return null;
    }
    return dropPos;
  } catch {
    return null;
  }
}

export function moveRangeTo(state: EditorState, dropPos: number): Transaction | null {
  const sel = state.selection;
  if (!isNodeRangeSelection(sel)) return null;
  if (dropPos > sel.from && dropPos < sel.to) return null;
  if (dropPos === sel.from || dropPos === sel.to) return null;

  const items: Node[] = [];
  sel.forEachItem((_p, n) => items.push(n));

  let tr = state.tr.delete(sel.from, sel.to);
  const adjustedDrop = dropPos > sel.to ? dropPos - (sel.to - sel.from) : dropPos;
  tr = tr.insert(adjustedDrop, Fragment.fromArray(items));
  const itemsSize = items.reduce((s, n) => s + n.nodeSize, 0);
  const newFrom = adjustedDrop;
  const lastSize = items[items.length - 1].nodeSize;
  const forward = sel.anchorIndex <= sel.headIndex;
  const anchorPos = forward ? newFrom : newFrom + itemsSize - lastSize;
  const headPos = forward ? newFrom + itemsSize - lastSize : newFrom;
  try {
    tr = tr.setSelection(
      new NodeRangeSelection(tr.doc.resolve(anchorPos), tr.doc.resolve(headPos)),
    );
  } catch {
    // selection fallback handled by caller
  }
  return tr.scrollIntoView();
}

interface DragState {
  phase: 'idle' | 'pending' | 'dragging';
  sourceFrom?: number;
  sourceTo?: number;
  sourceDepth?: number;
  startX?: number;
  startY?: number;
  dropPos?: number | null;
}

const DRAG_THRESHOLD = 3;
const KEY = new PluginKey<DragState>('nfp-bullet-drag');

export const bulletDragPlugin = new Plugin<DragState>({
  key: KEY,
  state: {
    init: () => ({ phase: 'idle' }),
    apply(tr, value) {
      const meta = tr.getMeta(KEY);
      if (meta) return meta as DragState;
      return value;
    },
  },
  props: {
    decorations(state) {
      const drag = KEY.getState(state);
      if (!drag || drag.phase !== 'dragging' || drag.dropPos == null) return null;
      const indicator = document.createElement('div');
      indicator.className = 'nfp-drop-indicator';
      return DecorationSet.create(state.doc, [
        Decoration.widget(drag.dropPos, indicator, { side: -1 }),
      ]);
    },
    handleDOMEvents: {
      mousedown(view, event) {
        const ev = event as MouseEvent;
        if (ev.button !== 0 || ev.shiftKey) return false;
        const target = ev.target as Element | null;
        if (!target) return false;
        if (target.closest('p')) return false;
        const li = target.closest('li');
        if (!li) return false;
        const posAt = view.posAtDOM(li, 0);
        const $pos = view.state.doc.resolve(posAt);
        let itemPos = -1;
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type === LIST_ITEM) {
            itemPos = $pos.before(d);
            break;
          }
        }
        if (itemPos < 0) return false;
        // Update selection (range maintenance handled by resolveBulletClickSelection-like logic)
        const sel = resolveBulletClickSelection(view.state, itemPos, ev.shiftKey);
        const tr = view.state.tr.setSelection(sel);
        const next = view.state.apply(tr);
        view.updateState(next);
        const range = next.selection;
        const drag: DragState = {
          phase: 'pending',
          sourceFrom: range.from,
          sourceTo: range.to,
          sourceDepth: isNodeRangeSelection(range) ? range.parentDepth : range.$from.depth,
          startX: ev.clientX,
          startY: ev.clientY,
        };
        view.dispatch(next.tr.setMeta(KEY, drag));
        attachWindowListeners(view);
        ev.preventDefault();
        return true;
      },
    },
  },
});

function attachWindowListeners(view: EditorView) {
  const onMove = (ev: MouseEvent) => onDragMove(view, ev);
  const onUp = (ev: MouseEvent) => {
    onDragEnd(view, ev);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onDragMove(view: EditorView, ev: MouseEvent) {
  const drag = KEY.getState(view.state);
  if (!drag || drag.phase === 'idle') return;
  if (drag.phase === 'pending') {
    const dx = ev.clientX - (drag.startX ?? 0);
    const dy = ev.clientY - (drag.startY ?? 0);
    if (Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
    document.body.classList.add('nfp-dragging');
  }
  const at = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
  if (!at) return;
  const $pos = view.state.doc.resolve(at.pos);
  let hoverItemPos = -1;
  let hoverItem: Node | null = null;
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === LIST_ITEM) {
      hoverItemPos = $pos.before(d);
      hoverItem = $pos.node(d);
      break;
    }
  }
  if (hoverItemPos < 0 || !hoverItem) return;
  const liEl = view.nodeDOM(hoverItemPos) as HTMLElement | null;
  let relativeY = 0.5;
  if (liEl) {
    const rect = liEl.getBoundingClientRect();
    relativeY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
  }
  const dropPos = computeDropPosition({
    doc: view.state.doc,
    sourceFromIndex: getIndexFromPos(view.state.doc, drag.sourceFrom ?? 0),
    sourceToIndex: getIndexFromPos(view.state.doc, (drag.sourceTo ?? 0) - 1),
    sourceDepth: drag.sourceDepth ?? 1,
    hoverItemPos,
    hoverItem,
    relativeY,
  });
  const updated: DragState = {
    ...drag,
    phase: 'dragging',
    dropPos,
  };
  view.dispatch(view.state.tr.setMeta(KEY, updated));
}

function getIndexFromPos(doc: Node, pos: number): number {
  try {
    const $pos = doc.resolve(pos);
    return $pos.index($pos.depth);
  } catch {
    return 0;
  }
}

function onDragEnd(view: EditorView, _ev: MouseEvent) {
  const drag = KEY.getState(view.state);
  document.body.classList.remove('nfp-dragging');
  if (!drag) return;
  if (drag.phase === 'dragging' && drag.dropPos != null) {
    const tr = moveRangeTo(view.state, drag.dropPos);
    if (tr) {
      view.dispatch(tr.setMeta(KEY, { phase: 'idle' }));
      return;
    }
  }
  view.dispatch(view.state.tr.setMeta(KEY, { phase: 'idle' }));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `vp test --run packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: Outliner.svelte に plugin を結線**

```typescript
import { bulletDragPlugin } from './plugins/bullet-drag';
```

`plugins:` 配列に `bulletDragPlugin` を追加（`bulletClickPlugin` の前）:

```typescript
plugins: [
  history(),
  keymap({ ... }),
  keymap(baseKeymap),
  pasteHandler,
  clipboardPlugin,
  bulletDragPlugin,
  bulletClickPlugin,
  separatorDecorations,
  rangeSelectionDecorations,
],
```

CSS を `<style>` に追記:

```css
.outliner-root :global(.nfp-drop-indicator) {
  height: 2px;
  background: var(--color-accent);
  margin-block: -1px;
  pointer-events: none;
}
.outliner-root :global(li::marker) {
  cursor: grab;
}
:global(body.nfp-dragging) {
  cursor: grabbing !important;
}
```

- [ ] **Step 6: 全体テスト**

Run: `vp check && vp test --run`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/client/src/lib/outliner/plugins/bullet-drag.ts \
        packages/client/src/lib/outliner/__tests__/bullet-drag.test.ts \
        packages/client/src/lib/outliner/Outliner.svelte
git commit -m "$(cat <<'MSG'
Add bullet-handle drag-to-reorder with drop indicator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 16: E2E テスト

**Files:**

- Create: `packages/client/tests/e2e/outliner-range.e2e.ts`

- [ ] **Step 1: E2E テストを書く**

```typescript
import { expect, test } from '@playwright/test';
import { focusEditor, resetDb } from './_helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetDb(page);
  await page.reload();
});

test('Shift+Click on a bullet extends NodeSelection to NodeRangeSelection', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('three');

  // Click first bullet
  const firstLi = page.locator('.outliner-root li').nth(0);
  await firstLi.click({ position: { x: 4, y: 8 } });

  // Shift+Click third bullet
  const thirdLi = page.locator('.outliner-root li').nth(2);
  await thirdLi.click({ position: { x: 4, y: 8 }, modifiers: ['Shift'] });

  // All three li should be highlighted
  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(3);
});

test('Shift+ArrowDown extends NodeRangeSelection from a NodeSelection', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');

  // Single bullet click
  await page
    .locator('.outliner-root li')
    .nth(0)
    .click({ position: { x: 4, y: 8 } });
  await page.keyboard.press('Shift+ArrowDown');

  await expect(page.locator('.outliner-root li[data-range-selected="true"]')).toHaveCount(2);
});

test('Backspace on a NodeRangeSelection deletes the entire range', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('one');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('two');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('three');

  await page
    .locator('.outliner-root li')
    .nth(0)
    .click({ position: { x: 4, y: 8 } });
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Backspace');

  await expect(page.locator('.outliner-root li')).toHaveCount(1);
  await expect(page.locator('.outliner-root li').first()).toContainText('three');
});

test('Mod+Shift+ArrowDown moves a NodeRangeSelection past the next sibling', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('d');

  await page
    .locator('.outliner-root li')
    .nth(0)
    .click({ position: { x: 4, y: 8 } });
  await page.keyboard.press('Shift+ArrowDown');

  // Use Alt-Shift on Linux/Windows CI runners
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+Shift+ArrowDown' : 'Alt+Shift+ArrowDown');

  const texts = await page.locator('.outliner-root li > p').allTextContents();
  expect(texts).toEqual(['c', 'a', 'b', 'd']);
});

test('Tab indents a NodeRangeSelection under the previous sibling', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');

  await page
    .locator('.outliner-root li')
    .nth(1)
    .click({ position: { x: 4, y: 8 } });
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Tab');

  // After indent: a > [b, c] — top-level li becomes 1
  await expect(page.locator('.outliner-root > .ProseMirror > ul > li')).toHaveCount(1);
  await expect(page.locator('.outliner-root > .ProseMirror > ul > li > ul > li')).toHaveCount(2);
});

test('Dragging the bullet moves the item to a new position', async ({ page }) => {
  const editor = await focusEditor(page);
  await editor.pressSequentially('a');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('b');
  await page.keyboard.press('Enter');
  await editor.pressSequentially('c');

  const firstLi = page.locator('.outliner-root li').nth(0);
  const lastLi = page.locator('.outliner-root li').nth(2);
  const firstBox = await firstLi.boundingBox();
  const lastBox = await lastLi.boundingBox();
  if (!firstBox || !lastBox) throw new Error('layout missing');

  await page.mouse.move(firstBox.x + 4, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastBox.x + 4, lastBox.y + lastBox.height * 0.9, { steps: 5 });
  await page.mouse.up();

  const texts = await page.locator('.outliner-root li > p').allTextContents();
  expect(texts).toEqual(['b', 'c', 'a']);
});
```

- [ ] **Step 2: E2E を実行**

Run: `pnpm --filter @note-first-presenter/client exec playwright test tests/e2e/outliner-range.e2e.ts`
Expected: PASS（6 件）

- [ ] **Step 3: 全体 E2E が壊れていないことを確認**

Run: `pnpm exec playwright test`
Expected: 全 E2E グリーン

- [ ] **Step 4: コミット**

```bash
git add packages/client/tests/e2e/outliner-range.e2e.ts
git commit -m "$(cat <<'MSG'
Add E2E tests for NodeRangeSelection workflows

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
MSG
)"
```

---

## Task 17: 最終 review check

- [ ] **Step 1: `vp check` と `vp test` を fresh state で走らせる**

Run: `vp check && vp test --run`
Expected: 全グリーン、formatting/lint/type も clean

- [ ] **Step 2: Playwright を走らせる**

Run: `pnpm exec playwright test`
Expected: 全グリーン

- [ ] **Step 3: 手動チェックリスト（ブラウザで）**

Run: `vp dev` でローカル起動し、`http://localhost:5173` を開いて:

- bullet をクリック → 単一 li がハイライトされる
- bullet を Shift+Click → 範囲がハイライトされる
- Shift+ArrowUp/Down → 範囲が伸縮する
- Escape → TextSelection に戻る
- 範囲選択中に `Mod+Shift+ArrowUp/Down` で範囲移動
- 範囲選択中に `Tab`/`Shift-Tab` で範囲 indent/outdent
- 範囲選択中に `Backspace` / `Delete` で範囲削除
- bullet をマウスドラッグ → 別位置に並べ替え（drop indicator が出る）
- copy → 別アプリへ paste → indented text として貼り付け可能

- [ ] **Step 4: PR に向けたまとめコミット（必要なら）**

何も追加する変更がなければスキップ。あれば individual commit に分けて整理。

---

## Self-Review Notes

- すべての spec セクションが対応するタスクを持つ:
  - NodeRangeSelection クラス → Task 1, 2
  - Selection 拡張操作（キー）→ Task 4, 5
  - Selection 拡張操作（マウス Shift+Click）→ Task 6
  - ドラッグ並べ替え → Task 15
  - 既存コマンドの range 対応 → Task 8 (move), 9 (duplicate), 10 (fold), 11 (backspace/delete), 12 (Tab/Shift-Tab), 13 (Enter)
  - 視覚スタイル → Task 7
  - テスト戦略 → 各 Task の TDD ステップ、Task 14 (clipboard), Task 16 (E2E)
- プレースホルダ「TBD」「TODO」「implement later」「適切な〜」は使用していない。
- 型・関数名の一貫性: `NodeRangeSelection`, `isNodeRangeSelection`, `createNodeRangeSelection`, `resolveBulletClickSelection`, `rangeAware{Sink,Lift,Split}ListItem`, `extendRangeSelection{Up,Down}`, `exitRangeSelection`, `computeDropPosition`, `moveRangeTo`, `bulletDragPlugin`, `rangeSelectionDecorations` — タスク間で一貫している。
