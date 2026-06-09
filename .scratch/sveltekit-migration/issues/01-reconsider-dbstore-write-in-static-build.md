Status: ready-for-agent

# Reconsider DbStore write behavior in static build

## Problem

`Presenter.svelte` の `DbStore` は static build（`isStatic === true`）時にも save コールバックを持っている:

```ts
const db = new DbStore({
  initial: defaultDb(),
  save: (state) => (isStatic ? Promise.resolve() : api('/api/db', { method: 'PUT', body: state })),
});
```

書き込みが成立する設計（`Promise.resolve()` で黙って成功させる）がおかしい。static build では:

- `readonly={isStatic}` で UI 上は編集不可になっている
- しかし DbStore 自体は書き込みを受け入れる構造のまま
- `save` が no-op で成功するため、呼び出し側はエラーを受け取らない

## Questions

- static build で DbStore のインスタンスを生成する必要があるか？ 読み取り専用ビューに特化したデータ保持で十分ではないか
- Presenter と静的ビューアを同じコンポーネントで兼用している設計自体を見直すべきか（別コンポーネント or 別ルートに分離）
- SvelteKit のルーティングに移行する際、`/` を編集モード、静的ビルド時は読み取り専用のビューアとして切り出す構成が自然か

## Comments

### 2026-06-10 グリルセッションでの決定

前提の更新: 本文は移行前のコードを参照している。現在は `Presenter.svelte` / `isStatic` は存在せず、`routes/+page.svelte` が `import.meta.env.DEV` で分岐している(ADR-0007)。ただし「no-op save で黙って成功する DbStore」と「ページ内に散った読み取り専用フラグ」という核心は現存する。

決定事項:

1. **static build は閲覧専用アーティファクトで確定**(CONTEXT.md の Viewer を参照)。閲覧者ローカルの書き込みの余地は残さない。
2. **問い 1 への答え: Viewer に DbStore は生成しない。** DB を一度 fetch して保持する読み取り専用データで十分。no-op save は廃止し、DbStore は Editor 専用となる(save は常に実 API)。
3. **問い 2 への答え: コンポーネントを分離する。** `+page.svelte` は `{#if import.meta.env.DEV}<Editor/>{:else}<Viewer/>{/if}` のみの薄い切替とし、Editor / Viewer を別コンポーネントにする。ビルド時定数なので static バンドルから Editor(DbStore・保存ロジックごと)はデッドコード除去される。共通部品(SlideList、テーマ切替等)はサブコンポーネントとして共有する。
4. **問い 3 への答え: ルート分離はしない。** static build は dev と同じ `/` を配信するため、モードは URL の属性ではなくビルドの属性。
5. **Viewer の Outliner は ProseMirror を `editable: false` で再利用する**(描画ロジックの二重化を避ける。separator 解釈の二重実装は特に危険)。キャレット移動は不要と決定したため、contenteditable を残す `filterTransaction` 方式は採らない。
6. **Viewer で許すのは表示状態の操作のみ**(折りたたみ、スライド選択)。Outline の内容変更は不可。折りたたみのクリック UI は前提機能として `.scratch/fold-toggle/issues/01-add-fold-toggle-chevron.md` に切り出した(本課題のブロッカーではないが、Viewer での折りたたみ操作はそれに依存する)。
