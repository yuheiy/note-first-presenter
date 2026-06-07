Status: needs-triage

# Reconsider DbStore write behavior in static build

## Problem

`Presenter.svelte` の `DbStore` は static build（`isStatic === true`）時にも save コールバックを持っている:

```ts
const db = new DbStore({
  initial: defaultDb(),
  save: (state) =>
    isStatic
      ? Promise.resolve()
      : api("/api/db", { method: "PUT", body: state }),
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
