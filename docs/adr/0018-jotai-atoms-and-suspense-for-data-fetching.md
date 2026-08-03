# データ取得を jotai の atom と Suspense に移し、`Resource` union を捨てる

自前の `Resource<T>` union と `useResource` フックを廃し、**読み取りは jotai の atom、ロード中は Suspense、失敗は `react-error-boundary`** に置き換える。「保存されるべき文書」を ref と state に割っていた構造も1個の同期 atom に畳む。**クライアントの依存が2つ増える**（`jotai`、`react-error-boundary`）— ADR-0017 の「依存は1つも増えていない」を意図的に破る取引で、割に合うと判断した理由は行数ではなく、**ref は「React の外」だが atom は「React が知っている外」である**こと（テストでき、購読でき、store 注入でテストごとに分離できる）。

実装の詳細（不変条件・罠）の正本はコード側のコメントにある: `workspace/db.ts`（ゲート/作業文書の分割、null 展開の危険）、`slides/slidesMeta.ts`（`startTransition`、`unwrap` の rejection）、`src/__tests__/boundaries.browser.test.tsx`（境界の挙動 — 並んでいるケースはすべて本 ADR 初版が実際に持っていた退行）。

## 設計決定

- **`meta` と `db` は所有者が逆であり、同じ抽象で扱わない。** `meta.json` の真実はサーバー（CLI が PDF/config を監視）でクライアントは購読者。`db.json` の真実はクライアント（CLI は検証して保存するだけ、ADR-0013）で「再取得」は概念として存在しない。meta は `atomWithRefresh` + `onMount` での HMR 購読（「読まれている間だけ鮮度を保つ」が購読のライフサイクルとして正確。`useSlidesMeta` というフックは存在すべきでない）、db は一度だけ読むゲート。
- **文書は「非同期のゲート」と「同期の作業文書」に分ける。** jotai の async atom の上に細粒度購読は載らない — `selectAtom(asyncAtom, …)` は promise を受けて `undefined` を返し（型で止まる）、`atom(async (get) => …)` 経由の derive は毎回新しい promise で購読者を全再レンダーする（**型が通る方が本当の罠**）。非同期はゲート1個に閉じ込め、`selectAtom` は同期 atom の上に載せる。`Outliner` は `useSetAtom` だけを使うので書いても再レンダーしない。
- **保存パイプライン（debounce・coalesce・retry・pagehide flush）は atom に入れない。** 依存グラフではなく「時間とネットワークの失敗」のロジック。React 非依存のまま保つことで、Node 層のテストが無傷で残り、Viewer のバンドルに漏れず、`flush()` が Promise を返せる。接続は `store.sub` 一本。
- **境界は loading を粗く、error を細かく（`ErrorOverlay` を描く場所ごと）。** 例外は2つ: Slideshow のタイトル取得は `<Suspense fallback={null}>` で個別に包む（粗い境界に相乗りさせるとスライドショー全体が白紙になる）。ルート grid の `--slide-aspect` は Suspense ではなく `unwrap` + try/catch で読む（意味のある既定値 16:9 があり、失敗を報告する UI が無い read には値モデルが正しい。`unwrap` は rejection を握らないので catch 必須）。
- **再取得は `startTransition` で包まなければならない**（包まないと Suspense 境界が fallback に戻り、スライド一覧が点滅する）。型でも lint でも捕まらず、ローカルでは fetch が速すぎて目視でも気づけないため、e2e（`liveUpdate`）が唯一の防壁。
- **Provider は置かない。** jotai の `useStore` は `useContext(StoreContext) || getDefaultStore()` なので、アプリはツリーに何も置かず、テストだけが `<Provider store={createStore()}>` で注入する。
- atom には `/*#__PURE__*/` を付ける（`atom()` は副作用を持ち、未使用でも落ちる保証がない）。

## Considered Options

- **TanStack Query**: 却下。stale-while-revalidate / focus refetch / invalidation / mutation のどれ一つこのアプリが要求していない。再取得トリガは HMR イベント1個。
- **依存ゼロ（自前8行 loader + `use()`）**: 次点として真剣に検討したが却下。ref と state の二重管理が残り、モジュールキャッシュは promise を共有しても generation という state を共有しないため、複数コンポーネントが同じリソースを読む形が構造的に組めない。
- **jotai の `loadable` を全面使用**: 却下。`{state: …}` は `Resource<T>` とほぼ同型で呼び出し側が何も変わらず、refresh 中に `loading` へ戻るので前データ保持の要件を自分で壊す。例外は `--slide-aspect` の `unwrap` 1箇所のみ。
- **自前9行の ErrorBoundary**: 却下。リセット手段が `key` による remount しかなく、エラーの無い通常の HMR リフレッシュでも子ツリーを作り直して前データ保持を壊す。`react-error-boundary` の `resetKeys` はエラー状態だけをリセットする。

## Consequences

- 依存2つは client がソース配信なので**公開ユーザーの実行時依存**である。`dependencies` と catalog の両方に載せること。
- **本 ADR の設計判断は二度、実測に覆されている**（いずれも「ソースを読んで筋が通ったから正しい」で書いた主張だった）。ライブラリの挙動と Suspense 境界の伝播については、この repo では推論の結論を採用せず、スパイクか実測で確かめること。
