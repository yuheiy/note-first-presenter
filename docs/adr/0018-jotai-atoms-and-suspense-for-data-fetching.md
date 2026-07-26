# データ取得を jotai の atom と Suspense に移し、`Resource` union を捨てる

`packages/client/src/components/useResource.ts` の `Resource<T>` union と `useResource` フックを廃し、**読み取りは jotai の atom、ロード中は Suspense、失敗は `react-error-boundary`** に置き換える。あわせて、`useEditableDb` が `savedRef`（ref）と `editedTitle`（state）に割っていた「保存されるべき文書」を **1 個の同期 atom** に畳む。**クライアントの依存が 2 つ増える**（`jotai`、`react-error-boundary`）。ADR-0017 が誇っていた「クライアントの依存は1つも増えていない」を、本 ADR は意図的に破る。

## 動機

自前ユーティリティを減らしたい。ただしライブラリを入れることでコードが複雑化するなら望まない — これが唯一の判定基準である。

`useResource.ts` は 79 行（実ロジック 35 行）で、client 全体 5341 行の 1.5% にすぎない。**この行数だけを見れば、依存を 2 つ増やす取引は割に合わない。** 割に合うと判断したのは、`Resource` union を捨てると**それを前提に書かれたガード分岐が連鎖的に消える**からであり、さらに `savedRef` という ref による回避策と、`editedGroupCount` の手書きバイパスが消えるからである。以下はその根拠の記録である。

## 設計決定

### `Resource<T>` は pre-Suspense のモデルである

| 関心事                 | `useResource`（現状）                | React 19                                  |
| ---------------------- | ------------------------------------ | ----------------------------------------- |
| ロード中               | union の `'loading'` を props で配る | `<Suspense>` の位置で表す                 |
| 失敗                   | `error: string` を props で配る      | `<ErrorBoundary>`                         |
| 再取得中の前データ保持 | `useState` が古い値を持つ副作用      | ライブラリの機構（後述）                  |
| promise キャッシュ     | `createResourceLoader`               | render 外（フレームワーク or ライブラリ） |
| 消費                   | `useEffect` + `setState`             | `use()`                                   |

React 公式の `use` リファレンスは promise を render 外でキャッシュすることを要求し、そのサンプルは `let cache = new Map()` をモジュールに置いたうえで「**通常このキャッシュのロジックはフレームワークの中にある**」と注記している。つまり React が外部に開けている穴は**供給側（キャッシュ）**であって、消費側（loading / error の分岐）ではない。`Resource` / `ResourceStatus` / `LOADING` / `useResource` は、React 本体に吸収される概念である。

この repo にとって移行は見た目より安い。**`SlidesMeta` の 4 つの kind のうち 3 つは 200 OK のデータであってエラーではない**（`slidesMeta.ts` が自分でそう書いている）。Suspense / ErrorBoundary モデルと衝突するのは `describeSlidesMeta` の第 2 引数 `error: string | null`（トランスポート失敗）だけで、移行後は `describeSlidesMeta(meta)` が **1 引数の純関数**になる。

消えるもの: `useResource.ts`(79) / `useResource.test.ts`(40) / `Resource<T>` / `ResourceStatus` / `LOADING` / `createResourceLoader` / `useSlidesMeta` / `useReadOnlyDb` / `WorkspaceProps.status` / `meta` prop / `describeSlidesMeta` の第 2 引数と null 分岐 / `Editor.tsx` と `Viewer.tsx` の loaded ガード群 / `Editor.tsx` の `editedGroupCount` state とその手書きバイパス / `Workspace.tsx` の「db と meta の両方を待つ」合流ガード。

### `meta` と `db` は所有者が逆であり、同じ抽象で扱ってはいけない

移行前のコードは両方を `createResourceLoader` + `useResource` で扱っていた。これが歪みの根であった。

|                    | `meta.json`                                         | `db.json`                                                                       |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| 真実の所在         | **サーバー**（CLI が PDF と config を監視して更新） | **クライアント**（CLI は唯一の他の書き手だが、検証して保存するだけ / ADR-0013） |
| クライアントの役割 | 購読者・ミラー                                      | 唯一の書き手。サーバーは保存先                                                  |
| 「再取得」         | 概念的に正しい                                      | **概念として存在しない**                                                        |

移行前に `loadDb` の generation が常に 0 だったのは、この非対称の現れである。同じ型で表現していたために、それが偶然に見えていた。CONTEXT.md の **DB** と **Slides Metadata** を隣り合わせに置いてあるのは、この非対称をグロッサリの並びから読めるようにするためである。

したがって:

```ts
const slidesMetaAtom = /*#__PURE__*/ atomWithRefresh(() => api<SlidesMeta>(META_URL));
slidesMetaAtom.onMount = (refresh) => onSlidesChanged(() => refresh());
```

**HMR 購読を `onMount` に置くのは行数の問題ではない。**「この atom が誰かに読まれている間だけ鮮度を保つ」というのが購読のライフサイクルとして正確だからである。フックに置くと「誰が購読の責任を持つか」が呼び出し側に漏れる。`useSlidesMeta` というフックは存在すべきでない。

### 文書は「非同期のゲート」と「同期の作業文書」に分ける

**jotai の async atom の上に細粒度購読は載らない。** これは実装前の調査で判明した事実で、設計の形を決めている。

`esm/vanilla/internals.mjs` の `readAtomState` は、async な read の戻り値を `setAtomStateValueOrPromise` にそのまま渡し、解決時に走る `settle` は依存の刈り込みしか行わない。つまり **`atomState.v` は解決後も promise のまま**であり、`returnAtomValue` もそれを返す。結果:

- **`selectAtom(asyncAtom, d => d.title)` は動かない。** selector が promise を受け取り、`undefined` を返す。
- **`atom(async (get) => (await get(asyncAtom)).title)` も駄目。** 再計算のたびに新しい promise が生まれ、`Object.is(prevValue, atomState.v)` が必ず false になって `++atomState.n`。**title が変わっていなくても購読者が再レンダーする。**

したがって非同期は**ゲート 1 個に閉じ込め**、細粒度購読は**同期 atom**の上に載せる。

```ts
const storedDbAtom = /*#__PURE__*/ atom(() => api<DbV1>(DB_URL)); // 非同期。ゲート
const draftAtom = /*#__PURE__*/ atom<DbV1 | null>(null); // 同期。作業中の文書
// main.tsx で一度だけ種を入れる（.catch は必要。§実装上の罠）
void store.get(storedDbAtom).then((db) => store.set(draftAtom, db));
```

`draftAtom` が種入れ前に読まれない保証は、ゲートを読むコンポーネントの Suspense が与える。以後 `selectAtom(draftAtom, …)` は同期で効く。

これで移行前の 3 分割が畳まれる。

- `savedRef.current`（**ref**、保存されるべき文書の全体） → `draftAtom`
- `editedTitle`（title だけの `useState`） → `selectAtom(draftAtom, d => d.title)`
- `editedGroupCount`（`useState` + 手書きバイパス） → `selectAtom(draftAtom, d => countNoteGroups(d.outline))`

`Outliner` は `useSetAtom` だけを使うので、**書いても再レンダーしない**。タイトル欄と groupCount は `selectAtom` の既定 `Object.is` で自動的に bail out する。

**この最後の点は、消える手書きコードの中でも質が高い。** `Editor.tsx` には「countNoteGroups は毎キーストローク再計算するが、値が動いたときだけ set する。React の等値 bail-out に任せないのは、その最適化が fiber に別の更新が乗っていると失効するからで、この下には memo が無い」という 5 行のコメント付きバイパスがあった。`selectAtom` は atom の epoch を進めないことで同じ効果を**失効なしに**得るので、コメントごと不要になる。

ref は「React の外」だが、atom は「**React が知っている外**」である。テストでき、購読でき、DevTools で見える。**これが jotai を入れる最大の見返りであり、フェッチのキャッシュより大きい。** 依存 2 つの取引が割に合うと判断した理由は、行数ではなくここにある。

### 保存パイプラインは atom に入れない

`createDbSaver` がやっているのは debounce・coalesce・in-flight 再入・失敗時の巻き戻し・retry タイマー・pagehide での同期 flush であり、**依存グラフではなく「時間とネットワークの失敗」のロジック**である。`db.ts` の「with no React in it」という既存の判断をそのまま維持する。接続は `store.sub(draftAtom, …)` 一本。

この判断は **3 つの見返りを同時に生んでいる**。

1. **`db.test.ts`（138 行 / 8 ケース）が無傷で残る。** atom に寄せていたら「store を作って atom を回す」形に全面書き直しだった。ADR-0005 の Node 層に置ける形が保たれる。
2. **Viewer のバンドルが汚れる余地を消す。** `atom()` はモジュールスコープの `keyCount` を進める副作用を持ち `/*#__PURE__*/` も付いていないため、未使用の atom が落ちる**保証がない**（Rollup が module-local な副作用と判定して落とす可能性はあるが、当てにはできない）。saver を atom の write 関数に入れていたら、落ちない atom の閉包経由で `createDbSaver` の 56 行が Viewer に残りうる。`Editor.tsx` が防ごうとしていた事態そのものである。
3. **`flush()` が Promise を返せる。** pagehide で待ちたいので必要だが、atom の write から取り出すのは不自然だった。

### 境界は loading を粗く、error を細かく — ただし例外が 2 つある

**Suspense の粒度は、error と同じく細かい。** 当初は `main.tsx` の既存の 1 個に相乗りさせる予定で、「アウトライナーは slot なので、それが待ってもシェルは残る」と考えていた。**これは実装後の検証で否定された** — slot でも React ツリー上は子であり、suspend は上方向の最も近い境界に伝播するので、ツールバーもテーマフッターも消える（実測: `packages/client/src/__tests__/boundaries.browser.test.tsx`）。したがって `Workspace` の各 ErrorBoundary の内側に Suspense を対で置く。fallback は移行前の挙動そのままで、アウトライナー枠は何も描かず、スライドパネルは `<Hint message="…" />`。

`main.tsx` の既存の 1 個は残る。 それはページチャンクの遅延ロード用で、**今も画面はチャンクが落ちるまで白紙**である。db/meta の fetch は `main.tsx` でチャンクのダウンロードと並行して開始され、どちらもローカルファイルなので、チャンクより先に着いている公算が高い — つまり通常は下の境界が fallback を出す暇もない。**それでも境界を細かく置くのは、「速いから見えない」は保証ではないからである。**

**ErrorBoundary は `ErrorOverlay` を描く場所ごとに置く。** 粗くすると確実に劣化する箇所が 2 つあるためである。

- 移行前は db が落ちてもツールバー・テーマフッター・スライドパネルは出た（アウトライナーの場所だけが `ErrorOverlay` に差し替わる）
- 移行前の `Slideshow` は db を**タイトルのためだけ**に読み、落ちても**黙って無視**してスライドを映していた

#### 例外 1: Slideshow のタイトル取得は Suspense も個別に置く

`Slideshow` は db を待たずにスライドを映す。`document.title` を設定するだけの子を切り出すのは ErrorBoundary のためだけではない — **粗い Suspense に相乗りさせると、その子が suspend した瞬間にスライドショー全体が白紙になる**。db.json は outline 全体を含むぶん meta.json より大きく、遅い方に引きずられる。したがってこの子だけは `<Suspense fallback={null}>` で個別に包む。

#### 例外 2: `--slide-aspect` は Suspense ではなく `unwrap` で読む

**`Workspace` を分解する必要がある。** 移行前の `Workspace` は本体で db と meta の両方を必要としており（`useSyncPublisher` に渡す実効スライド数、`computeSlideOverflow`、ルート grid の `--slide-aspect`）、そのままでは **throw が Workspace 本体で起きて、内側に置いた `ErrorOverlay` の境界に届かない**。ツールバーとテーマフッターごと落ちる — 「粗く畳んだら劣化する」として却下したはずの挙動になる。

分解の内訳:

- **`useSyncPublisher`** → 何も描画しない子コンポーネントに出し、`fallback={null}` の境界に入れる。データが無い間は publish しないのが正しい（移行前は `slideCount: 0` を publish していた）。
- **スライドパネル** → 子コンポーネントに出し、自前の ErrorBoundary → `ErrorOverlay`。
- **アウトライナー枠** → ErrorBoundary → `ErrorOverlay`（`m.outline_load_failed_status()`）。
- **タイトル欄** → 境界を置かない。同期の selector を読むだけで待たず、失敗もしない。**代わりに書き込み側にガードが要る**: 欄はシェルと一緒に描かれるのでドキュメント到着前に打てる。`{ ...null, ...patch }` は型エラーでも実行時エラーでもなく `{ ...patch }` を返すので、ガードが無いと `version` も `outline` も無い文書を実文書の上に PUT する。移行前にあった「ロード前の入力は捨てる」という判断はそのまま必要である。

**`--slide-aspect` だけは分解で解けない。** ルートの grid に載っており、`--scroll-tail` を通じて**両ペイン**が参照する（「Both panels use this same value so their bottom spacing matches」）。子に降ろすと下端余白が揃わなくなり、ルートで読むと throw する。

ここは `unwrap(slidesMetaAtom, (prev) => prev)` を使う。**アスペクト比には意味のある既定値（16:9）があり、失敗時に出すエラー UI が無いからである。** 消費側が正当な既定値を持ち、失敗を報告する先を持たない read には、Suspense ではなく値モデルが正しい。`unwrap` は保留中に前の値を保つので、PDF 差し替え中にレイアウトが跳ねることもない。

**ただし `unwrap` は rejection を握らない。** `loadable` との明示的な差がここで、当初の実装はこれを取り違えて「never throws」と書いていた。実測すると、meta の失敗はシェル本体で throw し、アプリが持つすべての境界より上なので誰も捕まえない — 分解が防ごうとした事態そのものが、分解のために入れた例外から起きていた。`await` を `try`/`catch` で包んで既定値を返すこと。報告はそれができるパネルの仕事である。

`loadable` を「Suspense を避けるための逃げ道」として却下した判断は維持する。例外はこの 1 箇所だけである。

### Provider は置かない

jotai の `useStore` は `useContext(StoreContext) || getDefaultStore()` である。**アプリ側は Provider を一切置かず**（`Workspace.tsx` の「no context anywhere in the tree」を守ったまま）、テストだけが `<Provider store={createStore()}>` で store を注入できる。

これは移行前より**良くなる**点である。`Editor.browser.test.tsx` は「`loadDb` がモジュール単位でリクエストをキャッシュするので、ファイル内の全テストで 1 個の db を共有せざるを得ない」という妥協を冒頭のコメントで認めていた。store を注入できればテストごとに分離できる。

### 再取得は `startTransition` で包まなければならない

移行前は `useResource` の `useState` が古い値を持ち続けることで**偶然**実現していた。「PDF が変わってもスライド一覧が読み込み中に戻らない」がその要件である。

設計時には jotai の `createContinuablePromise`（`jotai/esm/react.mjs`）がこれを単独で満たすと読んだ。refresh で新しい promise が生まれても abort ハンドラが新旧を同じ continuable promise に紐付けるので、`use()` に渡る identity が変わらず境界が再サスペンドしない、という筋である。

**この読みは実測で否定された。** 使い捨てブランチの Chromium で `store.set(refreshableAtom)` を裸で呼ぶと、**境界は fallback に戻る**。`createContinuablePromise` は単独では足りない。

正しくは React 公式の `Suspense` リファレンスが言うとおり、**refresh を `startTransition` で包む**。同じスパイクで、包めば前の値が残ることを確認した。

```ts
slidesMetaAtom.onMount = (refresh) => onSlidesChanged(() => startTransition(() => refresh()));
```

これは jotai の非公開 API ではなく **React の公開契約**に乗る形なので、当初の設計より脆くない。それが可能なのは、`useAtomValue` が `useSyncExternalStore` ではなく **`useReducer` ベース**だからである（React 19 では内部で `React.use()` を呼ぶ / `promiseStatus = !React.use` の分岐）。外部ストア由来の urgent 扱いにならないので transition が効く。つまり jotai は消費側を置き換えておらず、供給側だけを差し替えている。

それでも e2e は必須である。「refresh を transition で包み忘れる」は型でも lint でも捕まらず、**ローカルでは fetch が速すぎて目視でも気づけない**。

## 実装上の罠

**どれも型検査を通り、ローカルでは動いてしまう。** 唯一の例外は `selectAtom` で、そこだけは TypeScript が止めてくれる — 下記のとおり。

- **refresh を `startTransition` で包み忘れる。** §再取得は… のとおり、包まないと境界が fallback に戻る。**型でも lint でも捕まらず、ローカルでは fetch が速すぎて目視でも気づけない。** 罠としては最も危険で、e2e が唯一の防壁である。
- **`onSlidesChanged(refresh)` と直結してはならない。** `atomWithRefresh` の write は `args.length === 0` のときだけ refresh し、それ以外は dev で throw する。Vite の `hot.on(event, cb)` は cb にペイロードを渡すので直結すると踏む。`onSlidesChanged` の型が `() => void` なので TypeScript は気づかない。`() => startTransition(() => refresh())` で包むこと。
- **async atom から derive するときは同期 atom を経由する。** §文書は「非同期のゲート」と… のとおり。**危険なのは 2 つのうち片方だけである** — `selectAtom(asyncAtom, d => d.title)` は `TS2339: Property 'title' does not exist on type 'Promise<…>'` で止まる。一方 `atom(async (get) => (await get(asyncAtom)).title)` は**型が通り**、細粒度購読を黙って無効化する。こちらが本当の罠。
- **atom には `/*#__PURE__*/` を付ける。** `atom()` は副作用を持つため、未使用でもバンドルから落ちる保証がない。
- **rejected promise を放置しない。** 移行前の `createResourceLoader` は `.then(onFulfilled, onRejected)` で必ず fulfilled な promise を作っていたので `main.tsx` の `void loadDb()` が安全だった。jotai の atom は reject をそのまま持つため、ウォームだけしてまだ誰も読んでいない状態で失敗すると `unhandledrejection` が出うる。種入れの `store.get(storedDbAtom).then(…)` に `.catch` を付けること。

**ウォームのピン留めは不要である。** 設計時には「unmounted な atom のキャッシュは store epoch が上がると捨てられるので `store.sub` で固定が要る」と読んだが、スパイクで否定された。`readAtomState` が epoch ミス時に再計算するのは**依存が動いたとき**だけで、`storedDbAtom`（依存なし）も `slidesMetaAtom`（依存は private な refresh カウンタ 1 個）も、無関係な `store.set` では再実行されない。

## テスト

**「refresh 中に前のデータが残る」を e2e に 1 ケース足す。** 移行前はこの要件をコメントだけが保持しており、どの層でもテストされていなかった。`liveUpdate.e2e.ts` は「リロードせずに更新される」「未保存メモが残る」は見ていたが、スライド一覧が読み込み中に戻らないことは見ていない。**今回まさにその機構を入れ替え、しかも正しさが `startTransition` を書いたかどうか一点に懸かる**ので、無テストのままにはしない。HMR イベント → atom refresh → Suspense 境界という全経路を通る唯一の層なので e2e に置き、遅い層であることを踏まえて 1 ケースに押さえる。

**素朴に書くとレースになる。** `meta.json` はローカルファイルなので差し替えはミリ秒で終わり、「前のデータが残っている」中間状態を安定して観測できない。Playwright の `page.route` で `meta.json` の応答を意図的に遅延させ、その窓の中で観測すること。

`db.test.ts`（Node）は無傷。`useResource.test.ts`（Node）は削除する — atom 定義にテストする中身がない。`Editor.browser.test.tsx`（Chromium）は store 注入の形に書き換える。

## Considered Options

- **TanStack Query を入れる**: 却下。重厚さ以前に、**stale-while-revalidate / window focus refetch / invalidation / mutation のどれ一つとしてこのアプリが要求していない**。再取得トリガは HMR イベント 1 個、キャッシュ無効化は無し、書き込みは debounce/coalesce/retry という mutation とは別物。機能の大半が空回りする。
- **依存ゼロで通す（自前 8 行の loader + `use()`）**: 却下だが、**次点として真剣に検討した**。`createResourceLoader` から union を剥がすと 8 行になり、React 公式サンプルの `Map` と機能的に同一で、`react-error-boundary` 以外の依存が要らない。却下したのは `savedRef` と `editedTitle` の二重管理が残るからである。加えて `useSlidesMeta` の generation はフック内の `useState` なので、モジュールキャッシュは promise を共有しても **generation という state は共有しない** — 複数のコンポーネントが同じリソースを直接読むことが構造的に不可能だった。atom はモジュールレベルの state なので、これが消える。
- **jotai の `loadable` を全面的に使う**: 却下。`loadable` は Suspense を**使わないため**の逃げ道であり、`{state:'loading'|'hasData'|'hasError'}` は移行前の `Resource<T>` とほぼ同型なので、呼び出し側の形が何も変わらない。しかも `loadable` は refresh 中に `loading` へ戻るため、前データ保持の要件を自分で壊す。例外は `--slide-aspect` の `unwrap` 1 箇所のみで、その根拠は §例外 2 に書いた。
- **保存パイプラインも atom に寄せる**: 却下。§保存パイプラインは atom に入れない のとおり、テスト・バンドル分離・`flush()` の 3 つが同時に壊れる。
- **`db.ts` を読み取り用と編集用に分割する**: **不要と判明**。Viewer への漏れを心配して検討したが、saver を atom の外に置く限り、書き込み atom の中身は `set(draftAtom, …)` だけで `createDbSaver` も `saveDb` も参照しない。それらは `Editor.tsx` からしか参照されず、`pages/Workspace.tsx` の `import.meta.env.DEV` 分岐で丸ごと落ちる。残るのは atom オブジェクト数個である。
- **自前 9 行の ErrorBoundary で依存を 1 つに抑える**: 却下。必要な機能は「捕まえる・メッセージを出す・リセットする」だけで、`getDerivedStateFromError` だけの 9 行で書ける。却下したのは**リセット手段の違いが要件を壊すから**である。自前 9 行のリセットは `key={generation}` による remount しかなく、**エラーが出ていない通常の HMR リフレッシュでも子ツリーを丸ごと作り直す**ため、前データ保持の要件を壊す。`resetKeys` はエラー状態だけをリセットし、正常時は何もしない。`react-error-boundary` 6.1.2 は peer が `react: ^18 || ^19` で**ランタイム依存ゼロ**、React 公式の `use` リファレンスのサンプルでも使われている。
- **Suspense 境界も `ErrorOverlay` の位置ごとに細かく置く**: 却下。移行前の「シェルは即出る」挙動を完全に保てるが、境界コンポーネントが 4〜6 個になる。既存の `<Suspense fallback={null}>` が既に全画面を白紙にしており、fetch はチャンクのダウンロードと並行しているので、体感差が生じる根拠がない。例外は Slideshow の 1 箇所のみ（§例外 1）。
- **ワークスペースは全画面エラーで良しとする（Workspace を分解しない）**: 却下。db も meta も同じ CLI ミドルウェアが返すので片方だけ失敗するケースは狭く、境界 1 個で済ませる誘惑があった。却下したのは、それが単純化ではなく**仕様の劣化**だからである。分解の作業量は当初の見積もりに入っていなかったが、劣化を受け入れる理由にはならない。

## Consequences

- **クライアントの依存が 2 つ増える**（`jotai`、`react-error-boundary`）。ADR-0017 の「クライアントの依存は1つも増えていない」という記述は、以後この ADR で上書きされる。client はソース配信なので、これは**公開ユーザーの実行時依存**である。`packages/client/package.json` の `dependencies` と、`pnpm-workspace.yaml` の catalog の両方に載せること。
- **ツリーに Provider は現れない。** `Workspace.tsx` の「no context anywhere in the tree」は形式上維持されるが、jotai は内部で `StoreContext` を使う（Provider が無ければ既定 store に落ちる）。「context を宣言的に置かない」という性質は保たれ、「context が一切存在しない」は保たれない。
- **`Workspace` が分解される。** `useSyncPublisher` の呼び出しとスライドパネルが子コンポーネントに出る。props は 2 つ減る（`status`、`meta`）が、コンポーネントの数は増える。
- **`Slideshow` も同じ形に分かれる。** ページ本体は黒い面と境界だけになり、メタデータを読む `SlideStage` がその内側に入る。境界を置かないと meta の失敗が白画面になり、移行前に黒い面へ出していた文言が消える。
- **境界の挙動は `src/__tests__/boundaries.browser.test.tsx` が押さえている。** ここに並ぶ 4 件はすべて、この ADR の初版の実装が実際に持っていた退行である。**どれも他のテストは気づかなかった** — 両ファイルが着いた後のアプリは同一に描画され、ローカルでは着くのがミリ秒だからである。`api` を止めて窓を開ける以外に見る方法がない。
- **要件 1 つが、`startTransition` を書いたかどうかと e2e 1 ケースの上に乗る。** 「refresh 中に前のデータが残る」がそれである。当初はこれを jotai の非公開実装（`createContinuablePromise`）に帰していたが、スパイクで否定され、React の公開契約に乗る形に直した。脆さは減ったが、書き忘れを止める静的な手段は無い。
- **この ADR の設計判断は二度、実測に覆されている。** 一度目は使い捨てブランチのスパイクで 2 件（`createContinuablePromise` 単独で足りる / ウォームにピン留めが要る）、二度目は実装後の検証で 3 件（slot なら suspend はシェルに届かない / `unwrap` は throw しない / ロード前のタイトル入力は到達不能）。**いずれも「ソースを読んで筋が通ったから正しい」で書いた主張だった。** ライブラリの挙動と境界の伝播については、この repo では推論の結論を採用しない。
- **`createDbSaver` と `db.test.ts` は無傷。** 保存パイプラインは今後も React と jotai の外にある。
- **`describeSlidesMeta` が 1 引数の純関数になる。** `describeSlidesMeta.test.ts` の null 分岐のケースは削除される。
- **`Editor.browser.test.tsx` は store 注入でテストごとに分離できるようになる。** 「ファイル内で 1 個の db を共有する」という妥協は解消される。
- 移行前は `Resource` union の 3 分岐を各所で書き分けていたため、ロード中と失敗の扱いが**コンポーネントの数だけ**存在した。移行後は境界の位置がそれを一元的に決める。
