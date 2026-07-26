# React + React Aria Components 書き直し 移行スペック

`packages/client` を Svelte + `@ark-ui/svelte` + inlang(Paraglide)から **React + React Aria Components(RAC)** へ書き直すための実行スペック。地図 [#14](https://github.com/yuheiy/note-first-presenter/issues/14) の決定チケット([#18](https://github.com/yuheiy/note-first-presenter/issues/18) 〜 [#24](https://github.com/yuheiy/note-first-presenter/issues/24) / [#26](https://github.com/yuheiy/note-first-presenter/issues/26))を1つに集約したもので、**実行にあたって元の Issue を読み返す必要はない**(判断の背景を辿りたいときの出典は付録 B)。

決定チケットには本文と修正コメントの2層になっているものがあるが、本文書には**修正後の内容だけ**を書いている。

## 0. 前提と原則

- **書き直しであって翻訳ではない。** 現行 UI 仕様・DOM・挙動の細部の再現より、ライブラリを正しく効果的に使うことを優先する。
- **不変なのは機能セットのみ** — Outliner 編集、ノートグループとスライドの対応、スライド画像ペアリング、スライドショー、Editor/Viewer の2モード、テーマ、i18n(en/ja)。外部境界(サーバ API・DB 保存形式・CLI 統合点)もドメイン語彙も、都合が良ければ変更してよい(実際に §2 で2点変える)。
- **判断軸**: メンテしやすい、標準的で素直な React 構成。奇抜な選定より広く使われているものを選ぶ。
- **範囲外**: UI/UX の改善・新機能の追加。Viewer で折りたたみを操作可能にすること(§4.6 参照 — 現行実装では不可能で、可能にするのは新機能)。

---

## 1. 土台(ビルド・ルーティング・CLI 統合)

### 1.1 フレームワークは入れない

**素の Vite + `@vitejs/plugin-react`。** React Router framework mode は設定ファイル規約が ADR-0007 の「`configFile: false` のインライン設定が唯一の正本」と衝突し、TanStack Start は 1.0 未満のため、いずれも不採用。

SvelteKit の実利用範囲は「2ルートの出し分け」「`$lib` エイリアス」「静的出力」の3つだけで、いずれもフレームワークなしで代替できる。

### 1.2 ルーティング: 1 HTML + hash router(ルータライブラリなし)

| ページ         | URL              |
| -------------- | ---------------- |
| ワークスペース | `/#/3`           |
| スライドショー | `/#/slideshow/3` |

- ハッシュが空の `/` は起動時に `/#/1` へ置換する。
- URL 形式は **Slidev の hash モードに倣った**(番号だけのルートを主役のワークスペースに、名前 + 番号を副次ビューのスライドショーに割り当てる)。
- **ルータライブラリは入れない。** 2ページは1つのドキュメント内で行き来しない — スライドショーは常に `target="nfp-slideshow"` で別ウィンドウに開かれ、戻る導線もない。したがって「hash router」の実体は**起動時に `location.hash` を読んでページを選ぶだけ**で、履歴連携もルート遷移もない。
- スライドショーへのリンクは ``href={`#/slideshow/${activeSlide}`}`` + `target="nfp-slideshow"`。ハッシュのみの相対 URL なのでパスを含まず、サブディレクトリ配下でもそのまま動く。
- **`hashchange` リスナは置かない。** スライドショー窓は BroadcastChannel で既に追従しており、URL を第二の入力経路にする理由がない。
- hash はサーバに届かないので、静的配信のフォールバック問題(`200.html`)自体が消滅する。

### 1.3 エントリ

**`src/main.tsx` 1本。** `location.hash` を見て `React.lazy` による dynamic import で分岐先チャンクを読む。バンドル分割は維持され、スライドショーは Workspace 側(ProseMirror 等)を読み込まない。

**db / slides meta の fetch はこのエントリで前倒し発火する。** チャンク DL と通信が並列になる(現行は `onMount` で直列)。副次効果として StrictMode の effect 二重実行による二重 fetch も起きなくなる。

### 1.4 Editor / Viewer の分岐

**`import.meta.env.DEV` 分岐を維持**(dev = Editor、静的ビルド = Viewer)。define 定数(ADR-0001 の `__NFP_STATIC__`)は再導入しない。

§2 の URL 統一により `import.meta.env.DEV` の意味は **「書き込めるか / 読むだけか」の1軸だけ**に減る。

### 1.5 `<StrictMode>` は有効

Vite の React テンプレートの既定に従い、アプリ全体を `<StrictMode>` で包む。

Outliner での実害はない(§4.2)。逆に「マウント effect の依存に `initialOutline` や `onChange` が漏れて打鍵ごとにエディタが再生成される」類のバグを開発中に暴き続けるので、守られる側面が大きい。

### 1.6 CLI 統合(`createViteConfig`)

**ADR-0007 の原則(`configFile: false` のインライン設定が唯一の正本)は維持したまま中身を置換する。**

| 現行                             | 置換後                                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| `sveltekit()` + `adapter-static` | `react()`                                                             |
| `appType: 'mpa'` 相当の構成      | `appType` は**既定(`'spa'`)**、`build.rollupOptions.input` の指定なし |
| `200.html` フォールバック        | 消滅                                                                  |

- `dev.ts`(createServer)/ `build.ts`(viteBuild + `nfp-data/` 後置き)の流れは**無変更**。
- `ViteNfpPlugin` は**据え置き**。dev では middleware が `/nfp-data/*` を先に処理し、それ以外は SPA フォールバックで `index.html` を返す。
- **実アプリに効かせたい Vite プラグインは `createViteConfig` に追加する**(client の `vite.config.ts` はテスト/IDE 専用)という ADR-0007 追記の規則は React でもそのまま有効。ADR-0009(Tailwind)がこれに依拠している。
- CLI `dependencies`: `@sveltejs/kit` / `@sveltejs/adapter-static` / `@inlang/paraglide-js` を外し、`@vitejs/plugin-react` を追加。
- **Vite プラグインは1つも増えない**(i18n も §6 の決定によりプラグインを必要としない)。

### 1.7 `$lib` の後継

**エイリアスなし、相対 import に統一。**

### 1.8 HTML

**`packages/client/index.html` 1枚**(Vite の root 規約。現行 `src/app.html` から移動)。

- テーマ初期化スニペット(FOUC 回避のインラインスクリプト)を含む。複製先が消えたので共有注入機構は不要。
- **`dir="ltr"` は静的に記述**して実行時に触らない(en/ja は共に LTR)。
- `<html lang>` は §6 のとおり実行時に設定する。

> **必須**: `createViteConfig` は `app.html` を直接参照していない(SvelteKit が見つけていた)。素の Vite は `root` 直下の `index.html` を探すので、この移動は装飾ではなく必須。同時に client `package.json` の `files` に `index.html` を足さないと**公開パッケージが壊れる**(現在 `files` は `src` しか含まない)。

---

## 2. 外部境界(サーバ API・DB 形式)

ゼロベースで見直した結果、**変えるのは2点だけ**。残りは変える理由が見つからなかった。

### 2.1 スライドメタは常に 200 を返す

現行は `resolved` 以外の3つの `kind` を HTTP 422 で返し(`vite/plugin.ts`)、クライアントが try/catch して `err.data` を掘り出していた。ところが静的ビルドでは同じ union が普通の 200 の JSON ファイル。**同一のドメイン値が dev ではエラー、static では成功として流れていた。**

`no-config-no-file` は初回起動時の**正常状態**でヒントとして描画されるのでエラーではないし、React では error boundary / query の error state と正面衝突する。

→ **常に 200 を返し、`kind` の union をそのままペイロードに載せる。** 本物の失敗(500)だけがエラー。

### 2.2 URL 空間を `/nfp-data/*` に統一

dev の middleware も静的配信と同じ URL を出す:

| メソッド      | URL                                 |
| ------------- | ----------------------------------- |
| `GET` / `PUT` | `/nfp-data/db.json`                 |
| `GET`         | `/nfp-data/meta.json`               |
| `GET`         | `/nfp-data/slides/<hash>/0001.webp` |

- **`runtime-mode.ts` は廃止。** `slideFilename()` が両モード共通の URL 生成元になる。
- 統一先を `/nfp-data/*` にしたのは、逆向き(static が `/api/db` を拡張子なしファイルで出す)が任意のホストで content-type 依存になって脆いため。
- `PUT /nfp-data/db.json` は一見奇妙だが、`/nfp-data/db.json` を「db ドキュメントというリソース、静的配信時の実体がファイル」と読めば GET/PUT 同一 URL は素直。static には PUT が存在せず、Viewer も呼ばない。
- **採択理由**: Editor と Viewer の読み取りパスが完全に同一のコードになる。統一後の差分は「`saveDb` があるかどうか」だけ。
- **コスト(承知の上)**: dev middleware のルータ書き換え、`vite/__tests__/plugin.test.ts` の該当部、integration / e2e の `/api/*` 参照の更新。

### 2.3 据え置くもの(変える理由が無い)

- db の封筒 `{version, title, outline}` と**全文 PUT**。ローカル1ファイルの個人ツールで差分パッチは過剰。`keepalive` フラッシュ含め妥当。
- `.note-first-presenter.json` への tmp + atomic rename 書き込みと write chain。
- webp + hash + etag/immutable のスライド配信。
- HMR カスタムイベントによる live-reload(ADR-0008)。
- PUT の valibot 検証(ただしスキーマの所在は §9.2 で変わる)。
- **保存形式は ProseMirror JSON 据え置き、`version: 1` のまま**(§4.7)。

---

## 3. 状態管理とデータ取得

### 3.1 ライブラリは入れない

| 候補                            | 判断   | 理由                                                                                                                                                                                                                                     |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zustand / jotai                 | 不採用 | 導入条件(グローバルに散在・深いツリー・選択的購読での描画最適化)がどれも成立しない。管理対象は6つ、prop drilling は2階層                                                                                                                 |
| TanStack Query                  | 不採用 | スライドショーは常に別ウィンドウで開かれるので**別ドキュメント**であり、共有できるキャッシュが存在しない。通信は各ページ2本・マウント時1回、再取得は dev の HMR 1経路のみ、mutation は独自の保存パイプラインが持つ                       |
| React 19 `use()` + `<Suspense>` | 不採用 | 現行のローディングは部分的(ヘッダは即座に出て、アウトライナ領域とスライドリストだけが `…` になる)。Suspense に寄せると boundary の配置設計が要り、promise を安定させるためモジュールレベル発火が必要で import 時副作用がテストを固くする |
| `useSyncExternalStore`          | 不採用 | §3.5                                                                                                                                                                                                                                     |

### 3.2 3層に分ける

1. **React 非依存の純ロジックモジュール** — 保存パイプライン、BroadcastChannel の publisher/subscriber、theme の localStorage 読み書き、data-access モジュール。現行の `.svelte.ts` から `$state` を抜いた素の TS で、Node で直接ユニットテストできる。
2. **薄い hook** — 配線だけ。
3. **描画用 state** — `useState` / `useReducer`。

データ取得は `{status: 'loading' | 'ready' | 'error', data, error}` を返す薄い共通 hook 1枚(`useEffect` + `useState`)。現行の `ready` / `loadFailed` フラグ2枚を判別可能ユニオンに置き換える。

### 3.3 所有ルール

**複数ページで要るものはページが所有、Workspace 内で完結するものは Workspace が所有。**

```
main.tsx(location.hash 分岐 + fetch 発火)
├─ workspace ページ
│   ├─ Editor (DEV)   : useEditableDb()   ┐
│   └─ Viewer (!DEV)  : useReadOnlyDb()   │ + useSlidesMeta() + useActiveSlide()
│                                          ↓ props: title/groupCount/status/meta/
│      Workspace : useTheme() useListOpen()   activeSlide/onActiveSlideChange
│                  + BroadcastChannel publish  + titleArea/outliner(ReactNode)
│        └─ SlideList
└─ slideshow ページ : useSlidesMeta() + useActiveSlide() + subscribe
```

- **`useActiveSlide()`** — hydrate も URL 書き戻しも hook 内で完結。3ページが同じ hook を使うので、現行の重複と所有のにじみが同時に消える。初期値はハッシュのセグメントから読む。
- **`useSlidesMeta()`** — 取得と、dev のみの live-reload 再取得を内包(`import.meta.env.DEV` ガードで静的ビルドからは消える)。3ページ共通。
- **`useTheme()` / `useListOpen()`** — Workspace 所有。
- **BroadcastChannel の publish は Workspace** — `effectivePageCount = max(pdfCount, groupCount)` を計算しているのが Workspace だから。所有ではなく発信なので、`activeSlide` を props で受けたまま publish してよい。
- **slot は `titleArea` / `outliner` の `ReactNode` prop 2本**(現行の snippet と1:1)。render props にはしない。
- **Context はゼロ。** Workspace → SlideList / Outliner は1階層で、渡すのは `activeSlide` と `onActiveSlideChange` の2本だけ。
- **sync は一方向のまま**(Workspace → slideshow)。publish と subscribe を別 hook に分けることで、この非対称性が隠れずに見える形にする。

### 3.4 Editor / Viewer の2コンポーネントは維持する

両者の差は4点(タイトルが `<input>` か `<h1>` か / 保存するか / live-reload を購読するか / 空タイトルの扱い)まで縮むが、1本の `Workspace` + `editable` prop には**畳まない**。

`import.meta.env.DEV` は**定数に畳み込まれる**ので、2コンポーネントなら静的ビルドから Editor(保存パイプライン・live-reload・タイトル書き戻し)が丸ごと落ちる。`editable` を prop 経由にすると畳み込みが効かず Viewer に載る。

### 3.5 `useSyncExternalStore` を使わない根拠

対象5つを1つずつ当たった結果、**React 外で変化するスナップショットが1つも無い**。

| 対象                      | 実体                                                                                         | 表現                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| theme                     | localStorage を書くのは自分だけ(`storage` イベント購読なし = クロスタブ同期は現行機能に無い) | `useState(() => 初期読み出し)` + 永続化と `<html>` class 適用の effect   |
| listOpen                  | 同上                                                                                         | 同上                                                                     |
| activeSlide               | React が真実、URL は `replaceState` のミラー                                                 | `useState` + URL 書き戻し effect。URL は**初期値の供給元としてのみ**読む |
| BroadcastChannel 受信     | スナップショットではなく**メッセージ列**                                                     | `useEffect` で購読 → `setState`                                          |
| live-reload(HMR イベント) | 同じくイベント                                                                               | `useEffect` で購読 → meta 再取得                                         |

`history.replaceState` は `hashchange` も `popstate` も発火させないため、activeSlide の「React が真実、URL は履歴エントリを作らないミラー」という構造はハッシュ URL でもそのまま成立する。

### 3.6 db の React state 粒度

現行 Svelte では `outline` がリアクティブ状態で、`groupCount = countNoteGroups(outline)` が**打鍵ごとに再計算**され Workspace と SlideList(サムネイル N 枚)が再描画される。一方 Outliner に渡す `outline` は `untrack` で読まれており、実質「初期値」としてしか使われていない(ProseMirror が真実の持ち主だから)。

**Editor が React state に持つのは `title` / `groupCount` / `saveStatus` の3つだけ。`outline` は state に持たず ref。**

- Outliner の `onChange(json)` で: ref を更新 → saver に schedule → `countNoteGroups(json)` を計算し、**値が変わったときだけ** `setGroupCount`。
- Workspace が受け取るのは `outline` ではなく **`groupCount`**。打鍵してもノートグループ数が実際に増減したときしか再レンダリングが起きない。
- Outliner には**初期 outline を1回だけ**渡す(uncontrolled、§4.3)。
- Viewer は outline 不変なので `useMemo` で1回計算するだけ。
- `title` は `<input>` の controlled value と `<title>` の両方に要るので state のまま。

### 3.7 保存パイプライン

- **`createDbSaver({ save })` を React 非依存モジュール**として持つ(debounce 500ms / retry 5s / flush。現行 `DbStore` から `$state` を抜いた形)。
- `useEditableDb()` が saver を `useRef` で保持し、`onStatusChange` コールバックで `saveStatus` を `setState`。`pagehide` / `visibilitychange` の flush 登録もこの hook の effect。
- **`saveStatus` に `useSyncExternalStore` は使わない。** `getSnapshot` が参照安定な値を返す必要があり、複数フィールドをオブジェクトで返すと毎回 identity が変わって無限再レンダリングになる。回避策は書けるが、1箇所のためにその footgun を持ち込まない。
- **`lastError` は廃止。** UI から一度も読まれていない(現行 `Editor.svelte` は `saveStatus === 'error'` だけを見て汎用メッセージを出す)。参照しているのはテストのみ。
- `saveStatus: 'idle' | 'saving' | 'error'` は維持(`'saving'` は inflight の内部状態としてどのみち必要で、公開する追加コストがゼロ)。

---

## 4. Outliner(ProseMirror)の React 統合

### 4.1 ラッパーは素の `useRef` + `useEffect`

`useRef` でマウント先の `div` を掴み、依存配列 `[]` の `useEffect` で `EditorView` を生成、cleanup で `destroy()` する。

**react-prosemirror 系は不採用。** あの系統の価値は「node view を React コンポーネントとして書く」ことにあるが、**現行 Outliner に node view は1つも無い**(装飾はすべて `Decoration.node` の属性付与で見た目は CSS 側、折りたたみもキーマップで `collapsed` 属性を書き替えて CSS で消しているだけ)。得るものがゼロな一方、`@handlewithcare/react-prosemirror@3.2.7` は peer に `prosemirror-view: 1.42.0`(**完全固定**)、`react-reconciler`、`@tiptap/core|pm|react ^3.0.0` を要求し、本リポジトリの catalog(`prosemirror-view: ^1.42.1`)と噛み合わない。

将来 node view が必要になっても `nodeViews` オプションに渡す実装だけ差し替えればよく、`createRoot` で部分的に React を注ぐ逃げ道も残る。

### 4.2 StrictMode 下の挙動

`new EditorView()` → `destroy()` → `new EditorView()` と2回走るが、**初回マウント直後で編集が1つも入っていない**ので失うものがなく(undo 履歴も空)、`destroy()` が PM の DOM を撤去するので二重描画も起きない。caret 移動 effect と `scrollIntoView` も冪等。

### 4.3 最新 props の受け渡しは `useEffectEvent`

`EditorView` を `[]` の effect で1回だけ作るので、`dispatchTransaction` のクロージャは初回レンダーの `onChange` / `onActiveSlideChange` を捕まえたままになる(stale closure)。§3.6 により `onChange` は「ref 更新 → saver に schedule → `setGroupCount`」を行うため、古いままだと**保存が静かに壊れる**。

```tsx
const handleChange = useEffectEvent((json: unknown) => { ... });
const handleActiveSlideChange = useEffectEvent((n: number) => { ... });
useEffect(() => { /* new EditorView(...) で上の2つを呼ぶ */ }, []);
```

**検証済み**: `useEffectEvent` は React 19.2.8 の**安定版**に入っている(dev/production 両ビルドが `exports.useEffectEvent` を出し、`@types/react@19.2.17` でも `experimental.d.ts` ではなく `index.d.ts` に型がある)。また `react/exhaustive-deps` はこれを誤検知しない(§9.3)。

latest-ref パターン(同じ効果の手作業実装)も、親側で `useCallback` により identity を安定させる案(破れたときに静かに保存が止まる)も採らない。

### 4.4 初期 outline は遅延マウント + `initialOutline`(uncontrolled)

- `status === 'ready'` になるまで Outliner を描画しない。したがって初回マウント時点で doc は確定している。
- prop 名は **`initialOutline`**。`outline` だと「更新すれば反映される」と読めるが実際は初回しか読まない(現行が `untrack` で表現していた事実)ので、名前で uncontrolled を宣言する。
- **`key` による強制再マウントは不要。** db を丸ごと差し替える経路が存在しない(live-reload が再取得するのは slides meta だけで、db は初回ロード以降クライアントが唯一の書き手)。

「空 doc で即マウントして後で差し替える」案は不採用(1回しか通らない差し替え経路を恒久的に抱え、undo 履歴の起点と caret の扱いを考える必要が出る)。

### 4.5 activeSlide 同期と echo 抑制

- **外部 → エディタ**: `activeSlide` prop + `useEffect(..., [activeSlide])`。caret 移動と `scrollIntoView` はこの effect 内(現行と同じ)。
- **echo 抑制は `echoingActiveSlide` boolean をやめ、transaction meta にする。** caret 移動時に `tr.setMeta(ECHO_META, true)` を立て、`dispatchTransaction` は `tr.getMeta(ECHO_META)` が無いときだけ `onActiveSlideChange` を呼ぶ。

**echo 抑制自体は消せない。** 抑制が守っている具体的な破綻ケース: **空のノートグループ**では `findGroupPosition` は `itemPositions[0]` が無いので `rangeStart` を返す。この生の位置は直前グループの `rangeEnd` と同一だが、caret 移動は `Selection.near($pos, 1)` を通すので前方バイアスでスナップされ、実際の caret は `rangeStart` に留まらない。**破綻するのは先頭がセパレータでグループ1が空になる場合** — `rangeStart` が 0 でスナップ先が最初のセパレータ項目の段落、すなわち**グループ2の範囲**になる。抑制が無いと「スライド1を選ぶ → caret 移動 → エディタが『今は2です』と報告 → 選択が2へ押し流される」。

方向に注意: 巻き戻りではなく押し流しで、連続セパレータで**中間**に空グループができる場合(`a / --- / --- / c` の 2)は前方スナップがそのグループ自身のセパレータ段落に入るため食い違わない。実測(抑制を外して browser テストで確認)でも、中間の空グループは正しく 2 が報告され、先頭セパレータのケースだけが 1 の要求に対して 2 を報告する。

**meta を選ぶ理由**: フラグは「2つの effect が可変変数を共有し、`dispatch` が同期であることに暗黙に依存する」形で、React では `useRef` に置くしかなく StrictMode の二重実行に対して正しさを説明しづらい。meta なら因果がトランザクション自身に乗る。しかも**このリポジトリは既に同じ手段を使っている**(`commands/rangeIndent.ts` が `setMeta(SKIP_TEXT_SELECTION_CLAMP_META, true)` を立て `plugins/textSelectionClamp.ts` が `getMeta` で見ている)。

`appendTransaction` は `state.apply()` の内側で畳み込まれ `dispatchTransaction` が呼ばれるのは元のトランザクション1回だけなので、`textSelectionClamp` が meta 方式を破ることはない。

### 4.6 単一コンポーネント + 必須 `editable`

現行の `editable?: boolean`(`?? true` の暗黙デフォルト)を改め**必須 prop** にして呼び出し側に明示させる。マウント時に1回読むだけ。

**編集版/閲覧版への分割は行わない。** 分割すると `EditorView` のマウント・破棄・`dispatchTransaction`・caret 同期という唯一の命令的配線が二重化する。得られるのは未実測のバンドル差(gzip で十数 KB 程度の見込み)。将来 Viewer が実際に重いと実測できたら `plugins` 配列を組む関数を差し替えれば足りる。

**Viewer で編集系コマンドが不活性である根拠(検証済み)**: `keydown` は prosemirror-view の `editHandlers` に属し、ゲートは `view.editable || !(event.type in editHandlers)`(`prosemirror-view@1.42.1`)。`editable: false` では keydown ハンドラ自体が呼ばれず、keymap プラグインは発火しない。

**この帰結として `CONTEXT.md` の Viewer の記述を修正する**(§9.5)。折りたたみの起動経路は `Mod-ArrowUp` / `Mod-ArrowDown` のキーマップだけなので、Viewer では**操作できない**。Viewer が持つのは「Editor が保存した折りたたみ状態を表示する」ところまで。

`import.meta.env.DEV` を Outliner 内で直接読む案は不採用(Outliner がページのモードを知る必要はなく、テストから read-only を作れなくなる)。

### 4.7 公開インターフェースと保存形式

```ts
interface OutlinerProps {
  initialOutline: unknown; // 初回マウント時に1回だけ読む
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
  editable: boolean;
  onChange?: (outline: unknown) => void; // 編集版のみ渡す
}
```

- **`onChange` のペイロードは JSON 1つだけ。** `groupCount` は呼び出し側が `countNoteGroups(outline)` で算出する。`onChange` に同梱する案は「groupCount の導出経路が2つ並立する」ため不採用(Viewer が `countNoteGroups` を直接呼ぶ経路は消せない)。
- **型は `unknown` を維持。** outline はユーザーが直接編集できるディスク上の JSON 由来で、`docToItems` / `isSeparatorItem`(`jsonDoc.ts`)が防御的に絞り込む設計を保つ。
- **PM の型を outliner モジュールの外に出さない。** 現行は `lib/outliner/` の外に ProseMirror の型が一切漏れていない(Editor/Viewer/Workspace は `prosemirror-*` を import せず、境界を越えるのは素の JSON だけ)。パスが `components/outliner/` に変わっても、この境界はそのまま保つ。
- **保存形式は PM JSON 据え置き、`version: 1` のまま。マイグレーション無し。** 書き直しは ProseMirror を維持するので PM JSON から離れる動機が構造的に存在しない。独自の軽量ツリー JSON は `nodeFromJSON` / `toJSON` の無料で正確な往復を捨てて変換層を永久保守することになり、Markdown 風のアウトライン文字列は `collapsed` の置き場が無く**折りたたみ状態が保存できなくなる**(機能後退)。

### 4.8 PM 生成 DOM のスタイリング

**クライアント全体で `<style>` ブロックを持つのは `Outliner.svelte` だけ**(他は全て Tailwind ユーティリティ)。PM が DOM を生成し JSX からクラスを付けられないための例外。

- Outliner の隣に `outliner.css` を置き、**Tailwind の CSS エントリ(`src/style.css`)から `@import` する**(コンポーネントの JS からは import しない)。Oxfmt の Tailwind クラス並べ替えは単一スタイルシートをエントリに指定しているので、エントリの `@import` グラフに載せることでこの設定が1本のまま整合する。Tailwind v4 は自前で `@import` を展開するので `@theme` の値も同じ処理コンテキストで解決される。
- **代償(承知の上)**: 単一スタイルシートに載るので slideshow ページも Outliner の CSS を読む(現行の Svelte スコープ CSS はチャンク分割されていた)。100行程度なので許容する。
- ルート要素は `className="outliner-root contents"`。**クラス名 `outliner-root` を維持**するので e2e のセレクタが生き残る。
- **`display: contents` と手書き `scrollIntoView` は維持。** 前者は回避策ではなく `.ProseMirror` の `min-height: 100%` をスクロールコンテナに対して解決させる実質的な仕事をしている。後者も PM の `tr.scrollIntoView()` とは挙動が違い、「選んだスライドのノート先頭がパネル最上部にスムーズに来る」現行の体験を作っている。

### 4.9 `bowser` を廃止する

```ts
import { baseKeymap, macBaseKeymap } from 'prosemirror-commands';
// ProseMirror 自身の platform 判定をそのまま使う。prosemirror-commands は
// baseKeymap = mac ? macBaseKeymap : pcBaseKeymap と決めているので、この
// 同一性比較が PM の判定結果と一致する(独自の UA 判定を持たない)。
const isMac = baseKeymap === macBaseKeymap;
```

`bowser` はクライアント全体で1箇所、Outliner の macOS 判定(`Mod-Shift-Arrow` / `Alt-Shift-Arrow` の切り替え)にしか使われていない。boolean 1つのために UA パーサを抱えるのは不均衡で、しかも**判定器が2つあって食い違い得る** — `prosemirror-keymap` は `navigator.platform` で判定して `Mod-` を正規化するが、bowser は UA 文字列をパースする。iPadOS のデスクトップモードでは `navigator.platform` が `"MacIntel"`、bowser の `getOSName()` は `"iOS"` を返すため不整合が起きる。

`baseKeymap` は既に Outliner が import しているので**新しい依存も新しい UA 文字列も増えない**。PM の判定式は `navigator` が無い環境では `os.platform() === 'darwin'` にフォールバックするため、Node 側のユニットテストでも同じヘルパが解決できる。

`@react-aria/utils` の `isMac()` は不採用(実体が `react-aria/private/` 配下のサブパスにしかなく、`@react-aria/utils` を直接依存に宣言する必要がある)。

### 4.10 PM 資産の扱い

`plugins/` `commands/` `selections/` `schema.ts` `noteGroups.ts` `separator.ts` `jsonDoc.ts` は **React / Svelte 非依存の素の TS** なので、**そのまま移設し import パスのみ調整する**。React 化で書き換わるのは Outliner コンポーネント本体だけ。

現行 outliner の `__tests__` 16本は**1つも `EditorView` を構築しておらず**、すべて PM の state / plugin / command を Node で直接叩く純粋テストなので、React 化の影響を受けない(§8.4)。

---

## 5. UI コンポーネント(React Aria Components)

### 5.1 RAC の適用範囲

相当物があるインタラクティブ要素は**すべて RAC** を使う — `ListBox` / `Tooltip` / `Link` / `Button` / `TextField` / `RadioGroup`。素の `<img>` や `role="status"` の告知 div は RAC 化しない。

全面採用の理由: (1) `isSelected` / `isFocusVisible` / `isHovered` という単一のスタイリング規約で全要素を書ける、(2) 現行の `<fieldset role="radiogroup">` + `bind:group` のような綻びが消える、(3) `asChild` で素の `<a>` を包むパターンが `Link` に素直に収まる。

### 5.2 スライド一覧(ListBox)

**typeahead は受け入れる。** RAC には `typeahead={false}` に相当する公開プロパティがない(唯一の非互換)。現行がこれを無効化している理由はリポジトリ内のどこにも記述がなく、差分は機能的にプラス(数字をタイプしてスライドジャンプ)。`ListBoxItem` の子が文字列でない(サムネイル + 番号 span)ため `textValue={String(n)}` はどのみち必須。

**ArrowLeft / ArrowRight による前後移動は維持する。** typeahead と違いこちらはコメントで意図が明示された選択で、スライドショーページが Left/Right/Up/Down/Space/PageUp/PageDown をすべて前後送りに割り当てているのと一貫している。ただし **RAC には focusedKey を制御する公開プロパティがない**ため、`selectedKeys` だけ動かすと DOM フォーカスが取り残され、続く Down が1つ戻ったように見える。ハンドラ内で対象項目へ手動でフォーカスを移す:

```tsx
listRef.current
  ?.querySelector<HTMLElement>(`[data-key="${target}"]`)
  ?.focus({ preventScroll: true });
```

**ListBox 要素自身をスクロールコンテナにする。** `overflow-y-auto` / `container-type: size` / パディング / `scroll-padding` を親パネルの `<div>` から `<ListBox>` へ移す(RAC 公式のスタイル例も `.react-aria-ListBox { overflow: auto }` を前提にしている)。「アクティブ項目を先頭へ寄せる」自前 effect は維持する(初回 `auto`、以降 `smooth`)。

判断の要は**自前 effect がどのみち必要**な点: RAC 内蔵のスクロールは (1)「先頭寄せ」ではなく「最小限だけ見える位置へ」で、(2) フォーカス変化時しか発火しないので**エディタ側のカーソル移動で activeSlide が変わったときには動かない**。したがって選択肢は「自前 effect を持つか」ではなく「自前と内蔵が同じ要素を相手にするか」であり、同じ要素にすれば綱引きが構造的に起こらない。親パネルの `<div>` はメタ未解決時のヒント/エラーの置き場として残る。

**ark-ui プロパティの対応表**:

| ark-ui                            | RAC                                                              |
| --------------------------------- | ---------------------------------------------------------------- |
| `selectOnHighlight`               | `selectionBehavior="replace"`                                    |
| `deselectable={false}`            | `disallowEmptySelection`                                         |
| `loopFocus={false}`               | 指定不要(`shouldFocusWrap` の既定が無効)                         |
| `disallowSelectAll`               | 指定不要(単一選択では不要)                                       |
| `<Listbox.Label class="sr-only">` | `aria-label`(RAC の ListBox に `Label` サブコンポーネントはない) |

### 5.3 ツールチップとヘッダのトリガ

**ラッパーコンポーネントは Tooltip だけ作る。** RAC 公式ドキュメントは `vanilla-starter/Button` のようなラッパー層を前提に書かれているが、あれはデザインシステムを作る側のテンプレート。本アプリのインタラクティブ要素は全7箇所・各1回しか使わないので、全プリミティブをラップするとファイルを7つ増やして間接参照を1段深くするだけになる。Tooltip だけは矢印 SVG + 配置 + スタイルという塊が実際に2箇所で共有される。

- **矢印は維持する。** RAC は矢印の描画をアプリ側に任せる(`OverlayArrow` は配置と `data-placement` を与えるだけ)。公式 Tailwind 例どおり、ラッパー内にインライン `<svg>` と placement による回転を持つ。実質8行で、呼び出し側は `<Tooltip>{text}</Tooltip>` のまま。
- `interactive` は廃止(RAC に対応物がなく、中身はプレーンテキストなので入る用事がない)。
- `placement="bottom"` を明示(RAC の既定は `top` だが、トリガはビューポート最上部にあり常に反転する)。
- 表示遅延は RAC の既定のまま。

**トリガ要素**:

- 「スライドショーを開く」は **RAC `Link`**。`TooltipTrigger` は focusable な React Aria コンポーネントを子に取る前提で、素の DOM 要素には `<Focusable>` ラッパーが要るため、`Link` が唯一素直な選択。
- 一覧開閉ボタンは **RAC `Button` + `aria-expanded={listOpen}` + `onPress`**。`ToggleButton`(`aria-pressed`)は採らない — 隣接セクションの表示/非表示を制御するボタンは WAI-ARIA では disclosure(`aria-expanded`)で、`aria-pressed` は「太字」のような設定の on/off の表現。`ToggleButton` の利点(`isSelected` を render props で受けてアイコン weight を切り替える)は、`listOpen` が同スコープにある以上 `clsx` で書けば済む。

### 5.4 スタイリング規約

**プラグイン `tailwindcss-react-aria-components` は入れない。** 記法の短縮だけを提供するもので、Tailwind と RAC 双方に追随する依存が1つ増える。

**状態依存のスタイルは RAC の render props で受け、`clsx` で結合する。** `className` も `children` も render props を受けられるので、RAC 要素自身も内側の素の要素も同じ経路で状態を得る。`data-[…]:` / `group-data-[…]:` バリアントは使わない。RAC 由来でない条件(`listOpen` など)も同じく `clsx` で書く。

```tsx
<ListBoxItem
  id={String(n)}
  textValue={String(n)}
  className={({ isSelected, isFocusVisible }) =>
    clsx("flex items-start gap-2 rounded-lg p-3 select-none",
      isSelected && "bg-blue-200",
      isFocusVisible && "outline-auto")
  }
>
  {({ isSelected }) => (/* サムネイル or placeholder + 番号 span */)}
</ListBoxItem>
```

入れるユーティリティは **`clsx` のみ**。`tailwind-merge` / `tailwind-variants` は、クラス衝突の解決やバリアント定義が要るほどの規模ではない。

### 5.5 アイコン

**`@phosphor-icons/react` を deep import**(`@phosphor-icons/react/dist/csr/<Name>`)。エクスポート名(`PlayIcon` / `SidebarSimpleIcon`)も props(`size` / `weight` / `mirrored`)も現行 `phosphor-svelte` と同一なので移植は機械的。deep import は現行の `phosphor-svelte/lib/*` と同じ書き味で、barrel import の「dev 起動時に約9000アイコンのバレルを解決する」問題も回避できる(README 自身が推奨している形)。`IconContext` は使わない。

SVG 直書きは、duotone が2レイヤー構成でパスを手で持つと weight 変更や3つ目の追加が毎回手作業になるため退けた。

### 5.6 フォーム要素

**テーマ切替は `RadioGroup` / `Radio`。選択インジケータの丸は自前で描く。** RAC の `Radio` はネイティブ input を視覚的に隠す設計なので、ブラウザ既定のラジオの丸は使えない。描く場所は `.map()` 内の1箇所で3オプションが共有する。現行の `<fieldset>` に `role="radiogroup"` を上書きする書き方(fieldset 本来のグルーピング意味論を打ち消す)もこれで解消する。代償はネイティブが無料でくれるもの(強制カラーモードでの見え方など)を自分で面倒みること。

**タイトル欄は `TextField` + `Input`。** `onChange` が `string` を直接渡すので `e.currentTarget.value` を掘る必要がなくなる。レイアウト用の `mr-auto` はラッパー側、見た目のクラスは `Input` 側。コストは DOM ノードが1つ増えること。blur 時の「空なら既定タイトルに戻す」は `Input` の `onBlur` で維持。Viewer が `<h1>` を出す点も現行どおり。

### 5.7 ステータス表示

**`describeSlidesMeta` を純関数として置き、Workspace と Slideshow で共有する。**

```ts
export function describeSlidesMeta(
  meta: SlidesMeta | null,
  error: string | null,
  format: LocalizedStringFormatter,
): { tone: 'hint' | 'error'; message: string } | null;
```

現在 `meta.data.kind` の分岐が Workspace と slideshow ページの2箇所にあり、うち4アーム(`no-config-no-file` / `configured-but-missing` / `no-config-multiple-files` / 通信エラー)は同じメッセージを同じ引数で出す完全な重複。Workspace は `tone` で出し分け、Slideshow は `tone` を無視して `message` だけ使う(overflow は Slideshow 側で先に判定して早期 return)。React 非依存なので5分岐すべてを Node のユニットテストで直接叩ける。

**配置**(詳細は §7):

- `SlideshowFallback` は使用が1箇所だけなので独立コンポーネントをやめ、`pages/Slideshow.tsx` にインライン化。
- `SlideListHint` / `SlideListErrorOverlay` は残すが、後者は**アウトライナ側パネルの読み込み失敗でも使われている**ため `SlideList` 固有ではない。`components/Hint.tsx` / `components/ErrorOverlay.tsx` として汎用シェルにする。
- `ErrorOverlay` の `absolute inset-0` は現状どおり機能する(両パネルの `container-type: size` が layout containment を伴い、絶対配置の包含ブロックになるため)。**この暗黙の依存はコメントに書き残す。**

### 5.8 Portal / SlideImage

- **Portal は不要。** RAC にはポータルの汎用コンポーネントがなく、オーバーレイは既定で body へ自動ポータルされる。ポータル先を変える特殊ケースは本アプリに存在しない。
- **`SlideImage` は素の `<img>` のまま。** URL 生成元が `slideFilename.ts` に一本化される点は §2.2 の帰結。

---

## 6. i18n

### 6.1 機構: `@internationalized/string`

**Adobe Spectrum 2 と同じ方式** — `LocalizedStringDictionary` + `LocalizedStringFormatter`。**inlang / Paraglide JS は廃止する。**

S2 が使っている ICU JSON + コンパイラ(`@parcel/resolver-glob` と `parcel-transformer-intl`)は **Parcel 固有**で Vite には無い。かつ `LocalizedStringFormatter.format()` は `typeof message === 'function' ? message(variables, this) : message` なので、**プレーン文字列にパラメータ補間は効かない**(補間が効くのは ICU コンパイラの出力か手書きの関数のときだけ)。

### 6.2 著述形式: TS 辞書

ICU JSON + 自前 Vite プラグイン(S2 の完全同型)は**採らない**。`src/lib/intlMessages.ts` に TS 辞書として持ち、パラメータ付きのものは関数リテラルで書く。

```ts
const enUS = {
  /** `<html lang>` に設定する言語タグ。カタログの言語そのもの */
  htmlLang: 'en',
  saveError: 'Failed to save',
  overflowLabel: ({ n }: { n: number }) => `Slide ${n} (overflow)`,
  // ...
};
type Catalog = typeof enUS;
const jaJP: Catalog = {/* 同じキー・同じ引数型が強制される */};
export const intlMessages = { 'en-US': enUS, 'ja-JP': jaJP };
```

ICU コンパイラは 30+ ロケール・外部翻訳ベンダーへの JSON/XLIFF ハンドオフ・`plural` の多用という Adobe の事情に応える装置。当プロジェクトは2ロケール・17メッセージ・複数形ゼロ・翻訳者は本人。同じ装置を持ち込むと §1.6 で消したはずの生成物ディレクトリと自前プラグインが復活する。将来複数形が必要になったら `Intl.PluralRules` を関数内で直接使い、それが増えて辛くなった時点で ICU JSON に移すのは機械的作業。

**各メッセージに翻訳者向けの `description`(JSDoc コメント)を添える。** 現行の inlang メッセージには翻訳者向けの文脈情報がなく、`overflowLabel` や `titleDefault` は英日を書き分けるときに意図が要る。

### 6.3 辞書キーは `'en-US'` / `'ja-JP'`

`useLocalizedStringFormatter` は内部で `new LocalizedStringDictionary(strings)` を呼び、この第2引数 `defaultLocale` は **`'en-US'` 固定**。`getStringsForLocale` の最終フォールバックが `return strings[defaultLocale]` なので、キーを `'en'` / `'ja'` にすると **`fr-FR` などのブラウザで `strings['en-US']` が `undefined` になり直後の `strings[key]` で TypeError**。

`'en-US'` / `'ja-JP'` なら全経路が通る: `fr-FR` → `'en-US'` / `ja` → 前方一致ループで `'ja-JP'` / `en-GB` → `'en-US'`。

`new LocalizedStringDictionary(intlMessages, 'en-US')` を書く箇所では `defaultLocale` をコードに明示する(フックの内部既定値に依存させない)。

### 6.4 ロケール決定: `I18nProvider` をアプリに置かない

`useLocale()` は `I18nProvider` が無ければ `useDefaultLocale()` にフォールバックし、`navigator.language` を読む(`Intl.DateTimeFormat.supportedLocalesOf` で検証、失敗時 `en-US`、`languagechange` イベントを購読して自動再レンダリング)。カタログは辞書側のマッチング(完全一致 → 言語+スクリプト → 言語 → 前方一致 → 既定)で選ばれる。

**ロケール解決コードを1行も書かない。** `I18nProvider` は「ブラウザのロケールを上書きする」装置であり、上書きしたい要件はアプリには無い(テストにはある、§8.6)。

現行 Paraglide の `preferredLanguage` strategy との差は `navigator.languages`(配列走査)→ `navigator.language`(第1言語のみ)。第1言語が `fr`・第2が `ja` のユーザーが `en` を見ることになるが、2ロケールのツールでこの経路に投資する価値は薄い。副次的な利点として、`en-GB` ユーザーには `en-GB` がそのまま RAC に渡るので `useDateFormatter` などが英国式で動く。

### 6.5 呼び出し形: `useLocalizedStringFormatter` を直に呼ぶ

> **R2 の実測により、本節の第一案は成立せず退避案を採った(§6.6 の確定結果)。** 実装は `lib/intlMessages.ts` + `components/useMessages.ts` の2ファイル。以下は経緯として残す。

**薄い hook `useMessages()` は作らない。** `useLocalizedStringFormatter` は辞書オブジェクトに対してジェネリックなので `.format(key)` のキー補完は素で効く見込み。

```tsx
const format = useLocalizedStringFormatter(intlMessages);
<p>{format('saveError')}</p>
<p>{format('overflowLabel', { n })}</p>
```

**退避案(§6.6 のどちらかの条件が起きたら落ちる先)**: `lib/intlMessages.ts`(辞書・React ゼロ)と `components/useMessages.ts`(hook)の2ファイルに割る。この形なら react-aria 系の追加依存はゼロで、`useLocale`(RAC 由来)と `@internationalized/string` だけで組める。

```ts
type Args<K extends keyof Catalog> = Catalog[K] extends (args: infer A) => string ? [A] : [];
const dictionary = new LocalizedStringDictionary(intlMessages, 'en-US');
export function useMessages() {
  const { locale } = useLocale();
  const formatter = useMemo(() => new LocalizedStringFormatter(locale, dictionary), [locale]);
  return useCallback(
    <K extends keyof Catalog>(key: K, ...args: Args<K>) => formatter.format(key, args[0]),
    [formatter],
  );
}
```

### 6.6 `useLocalizedStringFormatter` の入手元(R2 で確定済み → 3 の退避案)

**この1点だけは決定チケットが解像度不足のまま残っている。** #19 は「`useLocalizedStringFormatter` は umbrella の `react-aria` にしか無い」と調べ、#22 は「`@react-aria/i18n` の `useLocalizedStringFormatter` を直に呼ぶ」と書いた。追加調査(2026-07-26)では **react-aria の公式ドキュメントに `useLocalizedStringFormatter` のページが存在しない**(`useLocale` / `useCollator` / `useDateFormatter` / `useNumberFormatter` / `useFilter` にはある)。文書化された公開 API ではないので、R2 では次の順で確定する。

1. `react-aria-components` の公開 export に含まれるか確かめる。含まれるなら**依存追加ゼロ**でそのまま使う。
2. 含まれないなら `@react-aria/i18n` を client の `dependencies` に足すが、**RAC が実際に解決しているのと同一バージョンに固定する**(catalog に書く際も `^` で緩めない)。
3. 同一バージョンに固定できない、または §6.5 のキー型付けが効かないなら、**§6.5 の退避案(自作 `useMessages()`)に落ちる**。react-aria 系の追加依存が不要になるので、この経路は常に成立する。

**2 で完全一致を要求する理由**: `@react-aria/i18n` は `I18nContext` を持つ。2コピー入ると `useLocalizedStringFormatter` が内部で読む `I18nContext` が RAC 側の `I18nProvider` と別物になり、**§8.6 のテストのロケール固定が静かに効かなくなる**(アプリは `navigator.language` を読むだけなので実行時には露見せず、テストだけが不安定になる)。#19 が umbrella の `react-aria` を退けたのと同じ理由が、サブパッケージにもそのまま当てはまる。

**R2 の確定結果(2026-07-26 実測、`react-aria-components@1.19.0`)**: 1・2 がともに不成立で **3 の退避案**を採った。

1. RAC の公開 export に含まれるのは `I18nProvider` / `useLocale` / `isRTL` / `useFilter` のみで、`useLocalizedStringFormatter` は無い。
2. `@react-aria/i18n@3.13.1` は `react-aria/*` サブパスへの**再 export シム**に変わっており、自身の依存が `react-aria: ^3.48.0`。対して RAC は `react-aria: 3.50.0` を完全一致でピンしている。**シム側のどのバージョンを固定しても react-aria の解決は固定できない**ため、react-aria 3.51 が出た時点で範囲とピンが分かれ、上段が言う2コピーが静かに入る(pnpm の `overrides` で押さえる手はあるが、2 が求めているのは保証であって現時点の偶然の一致ではない)。
3. よって `lib/intlMessages.ts` + `components/useMessages.ts`。追加依存は `@internationalized/string` と、`useLocale` のための `react-aria-components` のみ(§6.9 のとおり umbrella の `react-aria` は入れていない)。§6.5 のキー型付けは退避案側で成立している — キー補完、パラメータ有無の過不足、引数の型不一致がいずれも型エラーになることを確認済み。

### 6.7 `<html lang>` / `dir`

- **`dir="ltr"` は HTML に静的に記述**し、実行時に触らない。
- **`lang` はカタログが持つ `htmlLang`(`'en'` / `'ja'`)**を `useEffect` で `document.documentElement.lang` に設定する。

S2 は `Provider` が `lang={useLocale().locale}` を JSX 属性として書くが、**それが正しいのは S2 が ar-AE・he-IL を含む 30+ ロケールを同梱しているから**(ブラウザのロケールがほぼ常に辞書にある)。当プロジェクトは2ロケールなので `fr-FR` や `ar-AE` のブラウザが通常のケースとして発生し、同じ判断を輸入すると**英語のテキストに `lang="fr-FR"`、あるいは `dir="rtl"`** が付く。`lang` の役割は「このテキストが何語か」を支援技術に伝えることなので、**表示中のカタログの言語**を書く。

`<html>` を React が描画できない(SSR 無し・`#root` マウント)ため、`useEffect` で `document.documentElement` に設定する(`document.title` を JS で設定するのと同じ層の操作)。RAC 内部の書字方向は `useLocale().direction` を見るので `document.dir` を触らなくても壊れない。

### 6.8 命名と資産

- **フラット camelCase**(`saveError` / `slideListLabel` / `errorSlidesNotFound`)。snake_case は Paraglide 生成関数名(`m.save_error()`)の名残。ドット記法(S2 の `actionbar.*`)は 48 件を名前空間で仕切るための形で、17 件には不要かつ TS では全キーがクォート必須になる。
- カタログは**入れ子にできない**(`LocalizedStringDictionary` が `Record<K, LocalizedString>` を期待)。フラット一段が必須。
- **訳文 16 件は一字も変えずに移す**(`$schema` は落とす)。`htmlLang` を加えて **17 件**。うちパラメータ付きは4件(`errorSlidesNotFound` `{path}` / `errorMultiplePdfs` `{files}` / `overflowLabel` `{n}` / `pageTitle` `{title}`)。
- 呼び出し 53 箇所は Svelte → React の書き直しで全部触るので、改名コストは実質ゼロ。

| 現行キー        | 新キー           | 現行キー                 | 新キー                |
| --------------- | ---------------- | ------------------------ | --------------------- |
| `title_label`   | `titleLabel`     | `open_slideshow`         | `openSlideshow`       |
| `title_default` | `titleDefault`   | `toggle_slide_list`      | `toggleSlideList`     |
| `theme_label`   | `themeLabel`     | `slide_list_label`       | `slideListLabel`      |
| `theme_system`  | `themeSystem`    | `error_slides_not_found` | `errorSlidesNotFound` |
| `theme_light`   | `themeLight`     | `error_multiple_pdfs`    | `errorMultiplePdfs`   |
| `theme_dark`    | `themeDark`      | `info_no_slides`         | `infoNoSlides`        |
| `save_error`    | `saveError`      | `overflow_label`         | `overflowLabel`       |
| `load_error`    | `loadError`      | `page_title`             | `pageTitle`           |
| —               | `htmlLang`(新規) |                          |                       |

### 6.9 依存と削除

**追加**:

- client の `dependencies` に **`@internationalized/string`(`catalog:`)**。
- `useLocale` は **`react-aria-components` から取る**。`useLocalizedStringFormatter` の入手元は §6.6 で確定する。
- **umbrella の `react-aria` は入れない** — RAC が `react-aria` を完全一致でピンしているため、こちらが `^3.50.0` と書くと将来2コピー入り得る。`useLocale` はコンテキストを読む hook なので、コピーが分かれると別の `I18nContext` を読む。
- `@internationalized/string` は React コンテキストを持たない純データ層なので、重複しても無害。

**削除**:

- `packages/client/messages/{en,ja}.json`、`packages/client/project.inlang/`
- client `package.json` の `files` から `"messages"` / `"project.inlang"`
- `packages/note-first-presenter/src/vite/index.ts` の `paraglideVitePlugin` 呼び出しと import
- nfp の `dependencies` から `@inlang/paraglide-js`(catalog エントリも `cleanupUnusedCatalogs: true` で自動的に落ちる)
- 生成物ディレクトリ `packages/client/src/lib/paraglide` と、その `.gitignore` エントリ

---

## 7. ディレクトリ構成とファイル名規約

### 7.1 配置規約

参照したのは `vercel/commerce` と `facebook/astryx`(docsite / core 両方)の実測。

1. **最上位は `pages/` `components/` `lib/` の3つ。** `pages/` は**ルート骨格のみ**。単一ページ専用のコンポーネントも `components/` に置く。
2. **`components/` は領域フォルダ + 直下フラットの混在。** 中身が育っている領域だけフォルダにする(`outliner/` `workspace/` `slides/`)。単発は `components/Tooltip.tsx` のように直下。
3. **`lib/` は React を一切 import しない。** 中身は外部境界のみ。§8 の node テスト層と一致する。
4. **hook を含む状態モジュールは `components/` 側。** ページを跨いで使うもの(`activeSlide` `slidesMeta` `sync`)は `components/slides/` に、そのページでしか使わないもの(`theme` `db`)は `components/workspace/` に置く。
5. **`hooks/` フォルダは作らない**(規約4で置き場が決まる)。純ロジックと対の薄い hook は1ファイルに同居。
6. **テストは同居式 `__tests__/`**(隣接配置は採らない)。

### 7.2 ツリー

```
packages/client/
  index.html                                    ← src/app.html から移動(Vite の root 規約)
  src/
    main.tsx                                    location.hash 分岐 + React.lazy + fetch 発火
    style.css                                   Tailwind エントリ。outliner.css を @import
    vitest-browser.d.ts                         React 版に差し替え
    pages/
      Workspace.tsx                             DEV/PROD 分岐だけ
      Slideshow.tsx                             SlideshowFallback をインライン化
    components/
      Tooltip.tsx                               新設
      Hint.tsx  ErrorOverlay.tsx                汎用の状態表示シェル(ErrorOverlay は両パネルで使う)
      outliner/
        Outliner.tsx  outliner.css
        schema.ts  jsonDoc.ts  separator.ts  noteGroups.ts
        commands/    backspace cleanup duplicate fold move rangeIndent rangeSelect rangeSplit
        plugins/     activeSlideDecorations clipboard itemMultiSelect paste
                     rangeSelectionDecorations separatorDecorations textSelectionClamp
        selections/  nodeRangeSelection.ts
        __tests__/   15本
      workspace/
        Workspace.tsx  Editor.tsx  Viewer.tsx
        theme.ts  db.ts                         hook を含むので lib ではなくここ
        __tests__/
      slides/
        SlideList.tsx  SlideImage.tsx
        activeSlide.ts  slidesMeta.ts  sync.ts  overflow.ts
        __tests__/
    lib/                                        ← React ゼロ。外部境界のみ
      serverClient.ts  dbSchema.ts  slideFilename.ts  intlMessages.ts
      __tests__/
```

**消えるもの**: `lib/runtime-mode.ts` / `lib/paraglide/` / `messages/*.json` / `project.inlang/` / `src/app.d.ts` / `svelte.config.js` / `src/routes/`

### 7.3 個別の配置判断

1. **`outliner/active-slide.ts` → `outliner/noteGroups.ts`** に改名し、`count-groups.ts`(10行)を吸収。中身は `deriveNoteGroups` / `findActiveGroup` / `computeActiveSlide` / `findGroupPosition` で主題はノートグループ。改名しないと `slides/activeSlide.ts` と同名になる。
2. **`live-reload.ts`(26行)は `slides/slidesMeta.ts` に吸収。** 「CLI が PDF 変更を報せたらメタを取り直す」だけで、slidesMeta の鮮度の話。
3. **`describeSlidesMeta` は `slides/slidesMeta.ts` に同居**(規約3・4 により hook を持つ slidesMeta は `components/` 側なので純関数もそこへ)。§8 の層の鍵は接尾辞なので node 層のまま叩ける。
4. **overflow 計算の純関数は `slides/overflow.ts`。** SlideList の表示上の関心なので slides 領域。
5. **`sync-publisher.ts` / `sync-subscriber.ts` / `sync/messages.ts`(計41行)は `slides/sync.ts` 1枚に統合。**

### 7.4 ファイル名規約

- **React コンポーネントを export する `.tsx`: PascalCase** — `Workspace.tsx` `SlideList.tsx` `Outliner.tsx` `Tooltip.tsx` `Hint.tsx` `ErrorOverlay.tsx`
- **それ以外すべて: camelCase** — `slideFilename.ts` `serverClient.ts` `dbSchema.ts` `intlMessages.ts` `slidesMeta.ts` `activeSlide.ts` `noteGroups.ts`
- **`pages/` も同じ規約に従い PascalCase** — `pages/Workspace.tsx` `pages/Slideshow.tsx`。ページも React コンポーネントを export する `.tsx` なので例外を設けない。`pages/Workspace.tsx` と `components/workspace/Workspace.tsx` はベース名が同じになるが、ディレクトリで区別できる範囲であり `WorkspacePage` のような接尾辞は付けない。

**主な改名**: `node-range-selection.ts`→`nodeRangeSelection.ts` / `active-slide-decorations.ts`→`activeSlideDecorations.ts` / `item-multi-select.ts`→`itemMultiSelect.ts` / `text-selection-clamp.ts`→`textSelectionClamp.ts` / `range-indent.ts`→`rangeIndent.ts` / `json-doc.ts`→`jsonDoc.ts` / `db/client.svelte.ts`→`workspace/db.ts`。`commands/_cleanup.ts` の `_` 接頭辞は落として `commands/cleanup.ts`(`commands/index` が無いので「内部用」の合図として情報を持っていない)。

**root パッケージの e2e 2本も改名する** — `e2e/live-update.e2e.ts`→`liveUpdate.e2e.ts` / `e2e/outliner-range.e2e.ts`→`outlinerRange.e2e.ts`。`packages/note-first-presenter` は複数語ファイル名がゼロなので影響なし。

**エントリとスタイル**: エントリは `src/main.tsx`、Tailwind エントリは `src/style.css`、HTML は `packages/client/index.html`。

### 7.5 退けた案

- **`components/outliner/` を作らず Outliner をトップレベル `src/outliner/` に出す** — 「アプリは小さく、内製ライブラリを1つ抱えている」という実態には最も忠実だが、参照2つのどちらにも無い形なので採らない。代償として `components/` の8割が ProseMirror の内部実装になる点は受け入れる。
- **機能軸(`features/*`)** — `pages/Workspace.tsx` と `features/workspace/` が並んで意味が割れ、中身1〜2枚の feature フォルダを作ることになる。この規模では過剰。
- **`Workspace` を `pages/Workspace.tsx` に直書き** — (1) §8 の browser テストが `Editor` を直接 render するので named export が要り「ページはデフォルトエクスポート1つ」が崩れる、(2) §10 の R5(UI 部品)→ R6(ページ組み立て)が同一ファイル内に落ちる、(3) Editor/Viewer の2腕で1ファイルに4コンポーネントが同居する。
- **テストの隣接配置** — 現行 Outliner テスト15本のうち4本(`commands` / `range-commands` / `range-clipboard` / `range-decorations`)が単一モジュールに対応せず行き場を失う。「1:1 なら隣接、横断なら `__tests__/`」の混在ルールは置き場を毎回考えることになるので最悪。加えて §8.2 で層の鍵をファイル名接尾辞に移したので、ディレクトリを隣接にしても得られる情報が無い。

---

## 8. テスト戦略

### 8.1 守るべきもの / 守らないもの

既存テストスイートから逆算するのをやめ、「この製品が壊れたとき何が起きるか」から出発した。個人用・ローカル・単一ユーザーの著作ツールで、認証も同時実行も多テナントも無い。

|        | 守る対象                        | なぜ                                                                                                                                                                          |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | 原稿が消えない                  | `.note-first-presenter.json` の `outline` が唯一復元不能な資産(スライド画像は PDF から再生成でき、テーマもリスト開閉も捨てて構わない)。保存の欠落は**静かに**起きる           |
| **G2** | アウトライン編集操作が壊れない  | `commands/` 7本 + `plugins/` 7本 + カスタム Selection。**自作した非自明なアルゴリズムの塊**で、range 選択・indent・split のエッジケースは手で網羅できず、壊れても静かに壊れる |
| **G3** | ノートグループ ↔ スライドの対応 | 製品の中核概念そのもの。`---` 判定、`countNoteGroups`、過不足、activeSlide の一致                                                                                             |
| **G4** | 2モードの境界                   | Editor は書ける / Viewer は書けない / 静的ビルドが成立する。Viewer は**共有された後に壊れが判明する**ため、コストが非対称に高い                                               |

**明示的に守らないもの**:

- **N1 見た目と ARIA 属性の細部** — theme / listOpen / activeSlide の URL 同期 / ツールチップ遅延を含む。壊れても人間が即座に気づき、原稿は無傷。
- **N2 ライブラリの振る舞い** — RAC ListBox のキーボード、ProseMirror 本体。テストしても他人の実装の検証になる。
- **N3 i18n のキー網羅** — §6.2 の TS 辞書で**型が守る**。

書き直しがリスクをどこへ動かすかを重ねると、**厚くすべきは G1 と G4、G2 は維持、N1/N2/N3 は書かない。**

### 8.2 層の構え — ADR-0005 の4層を維持、鍵は接尾辞へ

| 層              | 鍵                              | ランナー                                 |
| --------------- | ------------------------------- | ---------------------------------------- |
| **node**        | `*.test.ts`(`.browser.` を除く) | Vitest / Node                            |
| **browser**     | `*.browser.test.{ts,tsx}`       | Vitest browser mode + Chromium           |
| **integration** | `test/*.test.ts`                | Vitest / Node、実 CLI                    |
| **e2e**         | `e2e/**/*.e2e.ts`               | Playwright、`dev` / `static` の2 project |

`*.svelte.test.ts` という自然な鍵が消えるため、**`adobe/react-spectrum` に倣って接尾辞キー `*.browser.test.{ts,tsx}`** を採る(あちらは3層すべて接尾辞キーで、`testPathIgnorePatterns` が `\.ssr\.test\.` と `\.browser\.test\.` を除外して既定層を引き算で定義している)。

**拡張子キー(`*.test.tsx` → browser)は退けた。** 「browser 層は必ず JSX を書く」という相関に層の判定を賭けることになるが、この相関は既に破れている — **この repo に実例がある**: `paste.svelte.test.ts` が browser プロジェクトにいるのは Svelte のせいではなく `plugins/paste.ts` の `new DOMParser().parseFromString(...)` のため。`.svelte.` という鍵は**実態を偽っていた**。接尾辞キーなら `paste.browser.test.ts` として素直に収まる。

**client の project 名を `client`/`server` → `browser`/`node` に改名する。** 現状は「client パッケージの client プロジェクト」という入れ子で、しかも書き直し後は `src/lib/server/**` が存在しなくなり `server` は完全な誤称になる。

**jsdom / happy-dom は使わない。** N1 の足切りの副産物として、DOM API を触る Node テストが1本も残らない(theme の localStorage、listOpen、activeSlide の hash 書き戻し/hydrate はすべて N1)。`BroadcastChannel` は Node 18+ にグローバルで存在するので sync publisher/subscriber は Node のまま。

**Slidev 型(中間層ゼロ)も全部 Chromium 1プロジェクトも退けた。** 前者が成立するのは Slidev の難所が全部 Node に落ちるから(あちらのクライアントは「markdown を描く」もので、判断が要るロジックはパーサ側にある)。この repo の難所はインタラクションで Node に落ちない。後者は PM 資産が DOM 不要なので起動コストを払って何も得ない。**ただし Slidev の主張のうち正しい部分は取り込んだ** — browser 層に載せるのは G3 配線と G4 分岐だけで、現行11本 → 3ファイルに絞る。

### 8.3 ツール: `vitest-browser-react`

現行 `vitest-browser-svelte` の直系後継(`2.2.0` / peer `vitest ^4.0.0`、カタログの `4.1.10` と整合)。`@vitest/browser-playwright` と `playwright` は既に devDependencies にあるので**増分は1パッケージのみ**。

- **入力イベントの忠実度**: vitest browser mode の `userEvent` は Playwright 経由で実ブラウザのネイティブ入力を発火する。`@testing-library/user-event` は JS でイベントを合成する。「実ブラウザなら jsdom の PointerEvent モックが不要で RAC と相性が良い」という結論の根拠はこの差。
- **RAC の作者自身がこれを使っている**(`react-spectrum` の `test/browser/setup.ts` の1行目が `import 'vitest-browser-react';`)。

**RTL(`@testing-library/react`)は退けた。** 素の普及度は RTL が上だが、この repo にとっては RTL のほうが「新しい流儀の導入」になる。加えて browser mode で使うと retry 機構が2系統(RTL の `findBy*` と vitest の locator)同居する。ロックインは実質ない(browser 層は3ファイル)。

**`@react-aria/test-utils` も採用しない。** N2 の足切りで RAC ListBox のキーボードをテストしないと決めた以上 ListBox テスターの用途がなく、`1.0.0-rc.0` かつ peer に `@testing-library/dom` + `user-event` を要求するため RTL 一式を引き連れてくる。

### 8.4 browser 層 = 3ファイル

| ファイル                    | 守る対象                        | 中身                                                                                                                                                |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**                  | G1 の React 配線 + G4 Editor 側 | `<StrictMode>` で render し、打鍵 → debounce → PUT のボディに最新 outline が入る / `pagehide` で flush する / 二重マウントで saver が二重にならない |
| **activeSlide 双方向**      | G3 配線                         | SlideList で選ぶと Outliner の active group が動く / Outliner のカーソルを別グループへ動かすと SlideList の選択が動く                               |
| **`paste.browser.test.ts`** | G2                              | React 非依存。`DOMParser` が要るだけ                                                                                                                |

- **`renderHook` は導入しない。** hook を「配線だけ」と定義した以上、配線だけの hook を単体テストすると**テストが実装の写像になる**。React 特有の危険(StrictMode 二重実行、cleanup、`pagehide` 登録漏れ、ref に降りた outline の鮮度)は**全て Editor 経由で自然に出る**。
- **activeSlide 双方向を採る理由が特に強い**: §4.5 で echo 抑制の実装方式を変えるが、echo 抑制は**双方向でしか壊れない**種類のバグで、片方向だけ叩いても出ない。
- **meta 分岐の描き分け(tone → role の写像)は不採用**(`describeSlidesMeta` が Node で5分岐すべてを守るので browser に残るのは2行の写像だけ。N1)。
- **Viewer のコンポーネントテストは不採用**(「read-only で描ける」は静的 e2e が実物で見るほうが強く、「PUT を呼ばない」も同じ e2e の非 GET チェックで守る)。

### 8.5 node 層

**PM 資産15本(`paste` 除く)をそのまま移設する。1本も削らない。**

N2 で当たり直したが **ProseMirror 本体を検証しているものは1本もない** — `commands/` 系7本、`plugins/` 系5本、`schema` / `separator` / `count-groups` / `active-slide` すべて自作ロジック。加えて §4.10 でロジックは無変更と決めたので**テストも無変更で通るはず**であり、1本でも落ちたら「移設で何かを壊した」という直接の信号になる。

配置は `src/components/outliner/__tests__/`。

そのほか node 層が持つもの: `createDbSaver`、`describeSlidesMeta`、overflow 計算、`countNoteGroups`、`separator`、sync publisher/subscriber。

### 8.6 テストでのロケール固定

**`<I18nProvider locale="en-US">` でロケールを明示固定し、期待値は英語リテラルを直書きする。**

S2 のテストは共通 render ヘルパーで `StrictModeWrapper` のみを巻き、ロケールは巻かず英語文言を直書きする。**それが成立するのは jest + jsdom が `navigator.language` を `en-US` に固定しているから** — 巻いていないのではなく固定を jsdom に委ねている。当プロジェクトのテストは vitest browser mode の実 Chromium で走り、Playwright の context locale は既定でシステムロケールに従うため、その固定装置が無い。委ね先を `I18nProvider` に移すのが同じ方式の正しい移植になる。

期待値をカタログ直 import(`enUS.saveError`)にはしない(辞書と辞書を比べることになり文言の意図しない変更を検出できない)。現行テストの `m.save_error()` 参照は**トートロジー**であり、これも解消される。日本語表示を検証したくなったら `locale="ja-JP"` で包む。

### 8.7 e2e — 既存4ファイルは全て維持、`static` project を新設

ゼロベースで当たり直したが**削るものはなかった**。すべて「その層でしか出ない」。

| 既存                                        | 守る対象  | その層でしかできない理由                                                            |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| typing persists across reload / title saves | G1 通し   | ブラウザ → サーバ → ファイル → 読み戻しの全経路                                     |
| `---` splits notes into two groups          | G3        | 実 PDF と実 outline の対応                                                          |
| slideshow BroadcastChannel sync             | G3        | **2つの実ドキュメント間**。browser 層では原理的に不可能                             |
| live partial update                         | —         | 実 dev サーバの HMR push が要る                                                     |
| Shift+Click / Mod+Shift+ArrowDown           | G2 の配線 | Node の PM テストはコマンドを直接呼ぶので、**キーマップが実際に発火するか**は出ない |

最後の1つは §4.9 で Mod キーの判定方式が変わることで価値が上がった(その変更の検証器になる)。

**`static` project の新設**: 現状 e2e は全て dev サーバに対してで、**静的成果物を実際に開くテストが1本もない**。§1.2 の hash router + §2.2 の URL 統一で、ここは書き直し後に最も壊れやすい場所になる(dev は middleware が動的に応答し、static は実ファイル配置がすべて)。

- `playwright.config.ts` の `webServer` を配列にして dev(5173)と静的配信(4173)を並立させ、`dev` / `static` の2 project に分ける。`vp run test:e2e` は1コマンドのまま。失敗時に project 名で「dev middleware の問題か静的配信の問題か」が切り分く。
- **コストは承知**: 静的系統は `dist/` を要し build に約60秒。既に `workers: 1` 直列なので体感できる。**setup project + `dependencies` で build を `static` project の前提にし、`--project=dev` では build 自体が走らない**構成にして、日常のループには乗せない。
- integration 層に置く案は ADR-0005 が4層に整理した動機(層の境界を曖昧にしない)に逆行するので退けた。別 config 案の唯一の利点(静的系統を回さない選択)は `--project=dev` で得られる。

### 8.8 integration — `build.test.ts` の dead-code マーカーを差し替える

`test/build.test.ts` の `expect(src).not.toContain('/api/')`(静的バンドルに live API 参照が無い = Editor が dead-code-eliminate されている)は、**§2.2 の URL 統一で空振りになる**。`/api/` がどこにも存在しなくなるので、Editor が丸ごと同梱されていても通る。しかも GET と PUT が同じ `/nfp-data/db.json` になったため、**URL では読み書きが区別できない**。

**採用: アサーションを削除し、`static` e2e で `page.on('request')` により「非 GET リクエストが0本」を確認する。**

- 文字列マーカーへの差し替え(`keepalive` / `'pagehide'` / `'visibilitychange'`)は flush の**実装詳細**なので、リファクタで登録方法を変えただけで赤くなり(偽陽性)、別経路の書き込みが増えても気づけない(偽陰性)。
- 「Editor 専用メッセージの不在」も**使えない** — §6.2 の TS 辞書はひとつのオブジェクトリテラルになり**キー単位の tree-shaking が効かない**ので、使われないメッセージも全部同梱される。
- 振る舞いチェックは minify にも実装変更にも影響されず、破れたときの症状(Editor が同梱されて PUT が404で永久リトライ)をそのまま検出する。
- **DCE 自体は G1〜G4 に含まれない。** 同梱される害は「重い」だけで、原稿も出力も2モードの境界も壊さない。

**ファイル配置の確認2本は残す**(エントリ HTML、`nfp-data/` の meta・db・スライド画像)。e2e が起動する前提そのものなので、壊れたときに e2e より早く原因が分かる。

### 8.9 機械的な帰結

- **削除**: `runtime-mode.{build,dev}.test.ts`(§2.2 で `runtime-mode.ts` 廃止)、`theme-store.svelte.test.ts` / `active-slide-store.svelte.test.ts`(N1)、`SlideList.svelte.test.ts` のキーボード8本(N2)、`SlideListHint` / `SlideshowFallback` / `SlideListErrorOverlay` / `SlideImage` のテスト(N1)
- **`db-client.test.ts`** → `createDbSaver` の node テストへ移設し、`lastError` を参照する2本を削除(§3.7 で廃止)
- **URL 更新**: `plugin.test.ts` / integration / e2e の `/api/*` → `/nfp-data/*`、`/slideshow` → `#/slideshow/*`
- `expect: { requireAssertions: true }` は維持
- `vitest-browser.d.ts` は React 版に差し替え

---

## 9. ツーリングとドキュメント

### 9.1 型検査は `vp check`(tsgolint)一本

`svelte-check` が担っていた3つ(テンプレート内型検査 / client の `check` スクリプト / `staged` の `'*.svelte'` フック)を**全削除**し、`tsc --noEmit` も per-package `check` スクリプトも足さない。

**この削除は #37 で前倒しした**(2026-07-26)。`svelte-check` が TypeScript 7 の下でクラッシュし `.svelte` を含む全コミットを止めていたため、テンプレート内型検査が実質ゼロの状態のまま先に落とした。経緯は **ADR-0007 の追記(2026-07-26)が正本**。§10.5 #8 は消化済み、#5 と #12 は `check` スクリプト・`svelte-check` devDependency・catalog エントリの分だけ消化済み。

**根拠(実測)**: `lint.options` の `typeAware: true, typeCheck: true` により `vp lint` は tsgolint で `.tsx` を型検査する(probe を置いて `vp lint` すると `typescript(TS2307)` `typescript(TS17004)` 等が出る)。追加の型検査は純粋に二重。

**代償**: `packages/client/tsconfig.json` は `"extends": "./.svelte-kit/tsconfig.json"` なので、SvelteKit 撤去で土台ごと消える。**R1 で自前に書き起こす** — 必須項目は `jsx: "react-jsx"` / `lib` / `target` / `moduleResolution` / `include` / `types`。

### 9.2 db スキーマの単一化(ADR-0002 の改訂を伴う)

`packages/client/src/lib/db/schema.ts` と `packages/note-first-presenter/src/db.ts` は valibot 定義もデフォルト値も**1文字も違わない**。

G1 の最も静かな壊れ方は「client が組み立てた PUT ボディをサーバの valibot が拒否し、saver が5秒ごとに永久リトライし、UI は `saveStatus === 'error'` の汎用メッセージだけを出す(§3.7 で `lastError` を廃止したため詳細が出ない)」。**この危険は重複そのものが生んでいる。**

→ **client が `./dbSchema` を export し、nfp が import する。**

- client の `exports` に subpath を追加する(現在 `"./package.json"` のみ): `"./dbSchema": "./src/lib/dbSchema.ts"`。nfp は `nodenext` 解決で `.ts` を型ストリップ import する。`valibot` は両パッケージの `dependencies` にあるので新規依存は増えない。
- **契約テストで守る案は退けた** — 重複を前提にした対症療法であり、実装するには結局 client がスキーマを export する必要がある(**同じ変更をした上でテストを足すことになる**)。
- **依存辺は既にある**(`cli.ts` が `import.meta.resolve('@note-first-presenter/client/package.json')` で client を解決済み)。client は `files: ["src"]` でソース配信、nfp も ADR-0010 でソース配信。
- **所有権の逆転に見えるが、既に漏れている方を直す** — `emptyDb()` がサーバ側にありながら `bullet_list` / `list_item` / `paragraph` という **ProseMirror のノード名をハードコード**している。サーバは既に client のドキュメントスキーマを知ってしまっている。封筒と初期ドキュメントは client の領分で、サーバは「JSON をアトミックに読み書きする」だけであるべき。
- §2.3 の「db 封筒は据え置き」とは衝突しない(**形式を変えず定義の所在だけを変える**)。

### 9.3 Oxlint は `react` プラグインのみ追加

```ts
lint: {
  plugins: ['eslint', 'unicorn', 'typescript', 'oxc', 'react'],
  rules: { 'react/rules-of-hooks': 'error', 'react/exhaustive-deps': 'error', /* 既存 */ },
}
```

**`plugins` は既定セットを上書きする**ので、既定セットごと明示が必須。

- **`jsx-a11y` は不採用** — §8.1 の N1(見た目と ARIA 細部を守らない)と衝突する。ARIA は RAC が生成し、こちらが書く JSX はほぼ RAC コンポーネントなので素の DOM 属性が少ない。
- **`react-perf` は不採用** — `jsx-no-new-object-as-prop` 等は実質 `useMemo`/`useCallback` の強制で、§3 の「ライブラリなし・素直な React」に反する。
- **R1 の作業**: `react` プラグイン ON で correctness カテゴリが一括有効になるので、`react/react-in-jsx-scope`(新 JSX transform と衝突)等の合わないルールを個別に `off` にして緑にする。

**実測で確定した事実**:

| 検証                                                             | 結果                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 既定プラグインに `react` は入っているか                          | **No**                                                                                                                                        |
| `rules` にルール名を書けばプラグインが自動 ON になるか           | **No**。`plugins` に列挙して初めて発火                                                                                                        |
| 既定セット                                                       | `unicorn` は ON。`import` / `jsdoc` / `promise` / `jsx-a11y` / `react-perf` / `vitest` は OFF。実質 `['eslint','unicorn','typescript','oxc']` |
| `react/exhaustive-deps` は §4.3 の `useEffectEvent` を理解するか | **Yes**。`useEffectEvent` の戻り値は deps に要求されず**誤検知なし**。素の欠落 deps は `react-hooks(exhaustive-deps)` で検出                  |

**`lib/` の React-free は lint で強制しない。** `overrides` でファイルスコープを切った `no-restricted-imports` は実測で期待どおり動く(`lib/` 内の `import ... from 'react'` だけが発火)ことを確認済みだが採らない。**本文書 §7.1 の規約3 の記述だけが担保である。**

### 9.4 knip

- **`packages/client/svelte.config.js` を削除。** 存在理由は knip の SvelteKit プラグイン検出だけ(ADR-0007 追記が明記)で、自動提供していた3つ(ルートの entry パターン / `$lib` 解決 / `$app`・`$env` の ignore)は React 構成で全て不要。
- **client の entry を `src/main.tsx` 1本に絞る**:
  ```json
  "packages/client": { "entry": ["src/main.tsx"], "project": ["src/**/*.{ts,tsx}"], "ignoreDependencies": ["tailwindcss"] }
  ```
  現状の `src/**/*.svelte` は**全 Svelte ファイルをエントリ扱いにしていて未使用コンポーネントを一切検出できていない**ので、狭くすることで knip が本来の仕事をするようになる。
- **テストを entry に含めるかは R7 で確定**(entry を絞るとテスト専用ヘルパが未使用判定されうる)。
- knip に React プラグインは不要(React はプラグインではなくただの依存)。

### 9.5 ドキュメント(ADR 起草計画)

| ADR                                                       | 扱い                         | 根拠                                                                                                    |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0002 二パッケージ・共有コードゼロ                         | **supersede → ADR-0013**(P2) | §9.2                                                                                                    |
| 0005 テスト4層                                            | **追記**(R7)                 | §8.2                                                                                                    |
| 0007 SvelteKit を UI 層に                                 | **supersede → ADR-0014**(R7) | §1                                                                                                      |
| 0011 ark-ui 採用                                          | **supersede → ADR-0015**(R7) | §5                                                                                                      |
| 0003 / 0004 / 0006(separator) / 0008 / 0009 / 0010 / 0012 | **無変更**                   | ProseMirror ドメイン・HMR・Tailwind テーマ・ソース配信・スライド抽象。grep で Svelte 言及ゼロを確認済み |

**ADR-0002 が supersede である理由**: ADR-0002 は独立した2主張を持つ。**(a) 共有 `core`/`types` パッケージを作らない** — client が export し nfp が import する形は新パッケージを作らず方向も `cli → client` のままなので**破らない**。**(b) ワイヤ型は各側が自前で定義する** — これを真っ向から破る。さらに Consequences の「サーバは PUT を**サーバ自前の valibot スキーマ**で入力検証する(信頼境界のガード)」が最も強い反対論拠。タイトルの主張そのものが撤回されるため、追記では見出しが状態と矛盾する。**ADR-0013 には「なぜ client 所有のスキーマでサーバが untrusted 入力を検証してよいのか(信頼境界の再説明)」を書く。**

**ADR-0005 が追記でよい理由**: 3つの中核判断(4層構成・root 配置・ファイル名キー)はすべて存続し、変わるのは (a) 鍵の綴り、(b) client の project 名、(c) e2e が2 project になること、の3点。ADR-0010 が ADR-0005 に Note を足したのと同じ形を採る。

**ADR-0014 に必ず書くこと(見落としやすい2点)**:

1. **ADR-0007 の追記2本の後継。** 0007 は追記で (a)「knip 検出用に空の `svelte.config.js` を置く」(b)「**実アプリに効かせたい Vite プラグインは `createViteConfig` に追加する**(client の `vite.config.ts` はテスト/IDE 専用)」を決めている。(a) は削除確定だが、**(b) は React でもそのまま必要な規則**で ADR-0009(Tailwind)が明示的に依拠している。0014 が引き取らないと置き場が消える。
2. **ADR-0001 への言及。** §1 の「素の Vite + hash router + CLI がサーバを所有」は実質 **ADR-0001 の立場への回帰**(0001 は 0007 に superseded 済み)。「0001 の判断に戻り、0007 で得ようとした file-based routing / `$lib` は不要と判断した」と明記しないと、将来の読者が ADR チェーンを往復して混乱する。

**i18n(§6)は独立 ADR を起こさず、ADR-0014 の Consequences に1段落**(既存の i18n ADR が無く、React 土台の選択に従属する決定のため)。

**`CONTEXT.md`**: `:30` の Viewer の記述だけを直す(§4.6)。「view-state operations (folding notes, selecting slides, running the slideshow) remain available」は誤りで、折りたたみは Viewer では操作できない。**この修正は本スペック文書の作成と同時に済ませる**(R1〜R7 の対象外)。他の語彙定義は全てフレームワーク非依存 — `NoteNode` は `packages/note-first-presenter/src/notes.ts` の CLI 側の型で書き換えの影響を受けない(確認済み)。

**root `CLAUDE.md`** はテスト層の表(§8.2 で鍵と project 名が変わる)を R7 で更新。

### 9.6 エージェント向け設定

- **`.mcp.json`: `ark-ui` を `react-aria` に差し替える**。`react-aria` MCP は現在 `~/.claude.json` の `projects[<repo>].mcpServers` に**マシンローカルで登録されているだけ**なので、リポジトリに昇格させる:
  ```json
  {
    "mcpServers": {
      "react-aria": { "type": "stdio", "command": "vpx", "args": ["@react-aria/mcp"], "env": {} }
    }
  }
  ```
  `@latest` は付けない(既存 `ark-ui` エントリと形を揃える)。**R7 のチェックリストに「`~/.claude.json` 側のローカル登録を消す」を残す**(リポジトリ外作業)。
- **`.claude/settings.json` を削除**(中身は `enabledPlugins: { "svelte@svelte": true }` の1行のみ。空オブジェクトのファイルを残さない)。供給元マーケットプレイス `sveltejs/ai-tools` はユーザーグローバル側なのでリポジトリのスコープ外。
- **`packages/client/CLAUDE.md` を削除**(React/RAC 版に置き換えない)。
- **`.gitignore` の `# SvelteKit` / `.svelte-kit` 節を削除。**

---

## 10. 実行計画

### 10.1 パッケージ配置: `packages/client` を in-place で置き換える

並行パッケージ(`packages/client-react` 等)は作らない。

- 両パッケージとも **npm 未公開**(ともに registry 404、version `0.0.0`)。「移行中もリリース可能な client を保つ」という制約が存在しない。
- CLI は `import.meta.resolve('@note-first-presenter/client/package.json')` でパッケージ名解決しているので、並行パッケージにすると CLI 側に切り替えスイッチが要る。
- しかも **CLI 側の変更は新 client と同時にしか成立しない**(§1.6 の `createViteConfig` 中身置換、§2 の URL 統一とスライドメタ常時 200、§9.2 の db スキーマ export/import)。並行構成にしても CLI は分離されず、`createViteConfig` が Svelte 用/React 用の2本立てになるだけで、並行構成が買うはずの「旧系統が動き続ける」が買えない。
- パス名が `packages/client` で Svelte 色がなく、新パッケージを作る命名上の圧力もない。旧実装の参照は `git show main:packages/client/...` で足りる。

### 10.2 ブランチ運用

```
main  ──P1──P2──P3──────────────────────────●  (統合ブランチを1発マージ)
                  └─ rewrite/react ──R1─…─R7─┘
```

Svelte→React の切り替えは原子的にしか起こせない(SvelteKit を外した瞬間に両ページとも React になる)。したがって争点は「その原子的マージの前に main へ入れられる準備をどこまでやるか」であり、**React と無関係に成立する6件を前倒しする**。

準備を main で終わらせてから統合ブランチを切るので、統合ブランチが main の変化を追う rebase が発生しない。R1〜R7 は統合ブランチ宛で、各々「統合ブランチ上で緑」を満たす。**main は最後まで Svelte 版が動いたまま。**

**却下した進め方**:

- 各チケットを main 直行 — 不可能(切り替えが原子的)。
- worktree で一気に書いて1コミット — レビュー粒度が消え、切り分け不能。
- Svelte と React を一時共存させて段階的に main 直行 — 技術的には可能だが「書き直しであって翻訳ではない」に反し、共存用の相互マウント配線という**捨てるためのコード**を書くことになる。

> 本リポジトリには PR #5「Phase 1」→ PR #6「Phase 2: UI の SvelteKit 撤去」という番号付きフェーズを main へ順次マージした前例があるが、あれは Svelte→Svelte で各フェーズ末に main が動いていたため成立した形であり、今回は取れない。

### 10.3 準備フェーズ(main 直行)

前倒しする6件は「React と無関係に成立する」もの。実利は2つ — 切り替えブランチが痩せて「React 化で壊れたのか境界変更で壊れたのか」が切り分けられること、echo 抑制のバグ修正が移行完了を待たずに main に入ること。

| #      | 内容                                                                                                                                                 | 参照               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **P1** | 外部境界: スライドメタ常時 200 + URL 空間を `/nfp-data/*` に統一し `runtime-mode.ts` 廃止。client / nfp 両方 + `vite/__tests__/plugin.test.ts` + e2e | §2.1 / §2.2        |
| **P2** | db スキーマを client から export し nfp が import(重複解消)+ **ADR-0013 の起草**(ADR-0002 を supersede)                                              | §9.2 / §9.5        |
| **P3** | 内部の小改善: `bowser` 廃止、echo 抑制を transaction meta へ、overflow 計算の純関数化                                                                | §4.9 / §4.5 / §7.3 |

**却下**: Svelte 版のコンポーネント境界整理(§7 のディレクトリ構成、§3.3 の所有ルール)の前倒し。捨てる実装への投資であり、Svelte の所有モデル(store/rune)と React の所有モデルは別物なので前倒しの意味が薄い。

### 10.4 切り替えフェーズ(`rewrite/react` 上)

依存: **R1 → {R2, R3, R4} → R5 → R6 → R7**。R2/R3/R4 は並行可能。1本 = 1エージェントセッション(100K トークン)相当。

| #                              | 内容                                                                                                                                                                                                                                                                                                                                 | 完了の目印                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **R1 土台**                    | SvelteKit/paraglide 撤去、`createViteConfig` を React 版に、`index.html` 1枚、`main.tsx` の hash 分岐 + `React.lazy`、Tailwind エントリ + `outliner.css` の `@import`、CLI deps 差し替え、テスト設定の器(project を `browser`/`node` に改名・`*.browser.test.{ts,tsx}` 鍵・`vitest-browser-react`・jsdom 撤去・e2e `static` project) | プレースホルダ2ページが dev/build 両方で起動し `vp check`/`vp test` が緑 |
| **R2 i18n**                    | `lib/intlMessages.ts`(17件)+ `useLocalizedStringFormatter` 直呼び + `@internationalized/string`、paraglide 完全撤去                                                                                                                                                                                                                  | —                                                                        |
| **R3 Outliner**                | PM 資産15本をそのまま移設 + React ラッパー(`useRef`/`useEffect`/`useEffectEvent`/遅延マウント/transaction meta)                                                                                                                                                                                                                      | PM の node テストが緑                                                    |
| **R4 データ層**                | db client / sync / slidesMeta / activeSlide / theme を React 非依存の純ロジック + 配線 hook に                                                                                                                                                                                                                                       | node テストが緑                                                          |
| **R5 UI 部品**                 | RAC 化(ListBox/Tooltip/Link/Button/TextField/RadioGroup)、`@phosphor-icons/react`、`clsx`、SlideList/Hint/ErrorOverlay/SlideImage/ツールバー、`describeSlidesMeta`                                                                                                                                                                   | —                                                                        |
| **R6 ページ組み立て**          | `pages/`、Workspace/Editor/Viewer、所有ルールの配線、hash 分岐の実体化。browser テスト3本 + e2e 更新                                                                                                                                                                                                                                 | アプリが実際に動く                                                       |
| **R7 ツーリング/ドキュメント** | §9 の残り(下表の R7 行)+ ADR-0014/0015 起草・ADR-0005 追記                                                                                                                                                                                                                                                                           | `vp check`/`vp test` 全層緑                                              |

**R1 の削除/保持の内訳**:

- **削除** = `.svelte` 12本 / `.svelte.ts` ストア4本(`db/client` `active-slide/active-slide-store` `slides-meta/slides-meta-store` `theme/theme-store`)/ `routes/` / `paraglide/` / `app.html` / `app.d.ts`
- **保持** = PM 資産・`lib/sync/*`・`lib/dbSchema.ts`・`lib/slide-filename.ts`(いずれも素の `.ts` で React 非依存)

**R7 は統合ブランチ内に置く。** ドキュメントは新しい状態を記述するので、main マージ後に回すと移行中ずっとドキュメントが嘘になる。

### 10.5 ツーリング項目の振り分け

| #   | 項目                                                                                                                 | 割り当て                                    | 根拠                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADR-0013 起草(0002 supersede)                                                                                        | **P2**                                      | P2 = db 単一化 + ADR 改訂                                                                                                     |
| 2   | `packages/client/tsconfig.json` を自前で書き起こす                                                                   | **R1**                                      | これ無しに型検査が成立しない                                                                                                  |
| 3   | `packages/client/.svelte-kit/` 削除                                                                                  | **R1**                                      | 偽陽性の除去(付録 A)                                                                                                          |
| 4   | `packages/client/svelte.config.js` 削除                                                                              | **R1**                                      | SvelteKit 撤去と不可分                                                                                                        |
| 5   | client `package.json`: `prepare` スクリプト削除、svelte 系 devDeps・`svelte` 削除、`files` に `index.html` 追加      | **R1**                                      | 依存撤去と同時(`check` と `svelte-check` は #37 で消化済み)                                                                   |
| 6   | client `package.json`: `files` から `messages`/`project.inlang` 削除、`@inlang/paraglide-js` 撤去                    | **R2**                                      | i18n の担当範囲                                                                                                               |
| 7   | client `package.json`: `@ark-ui/svelte`/`phosphor-svelte` 撤去、`react-aria-components`/`@phosphor-icons/react` 追加 | **R5**(`react-aria-components` のみ **R2**) | UI 部品の担当範囲。ただし §6.6 の確定結果として R2 の `useMessages()` が `useLocale` を要るので、RAC の追加だけ R2 で済ませた |
| 8   | ~~root `vite.config.ts`: `staged` の `'*.svelte'` エントリ削除~~                                                     | ~~R1~~                                      | **#37 で消化済み**(§9.1)                                                                                                      |
| 9   | root `vite.config.ts`: `lint.plugins` に `react` 追加 + react ルール確定                                             | **R1**                                      | R2 以降の全コードが対象                                                                                                       |
| 10  | root `vite.config.ts`: `fmt.sortTailwindcss.stylesheet` を `packages/client/src/style.css` へ                        | **R1**                                      | Tailwind エントリ移動と同時                                                                                                   |
| 11  | nfp `package.json` / `createViteConfig`: kit・adapter-static・paraglide 撤去、`@vitejs/plugin-react` 追加            | **R1**                                      | §1.6 の決定そのもの                                                                                                           |
| 12  | `pnpm-workspace.yaml` catalog の svelte 系削除・react 系追加                                                         | **R1**                                      | 依存撤去と同時(`svelte-check` は #37 で消化済み)                                                                              |
| 13  | `pnpm-workspace.yaml` の `overrides.typescript` 再検討                                                               | **R7**                                      | 緑には影響しない                                                                                                              |
| 14  | `knip.json` の client エントリ書き換え・`svelte.config.js` 前提の解消                                                | **R7**                                      | knip は R7 集約                                                                                                               |
| 15  | `.gitignore` の `.svelte-kit` 節削除                                                                                 | **R7**                                      | 緑に無関係                                                                                                                    |
| 16  | `.mcp.json` を react-aria に差し替え / `.claude/settings.json` 削除 / `packages/client/CLAUDE.md` 削除               | **R7**                                      | 同上                                                                                                                          |
| 17  | root `CLAUDE.md` のテスト層の表を更新                                                                                | **R7**                                      | 同上                                                                                                                          |
| 18  | ADR-0014 / ADR-0015 起草、ADR-0005 追記                                                                              | **R7**                                      | 同上                                                                                                                          |
| 19  | `e2e/live-update.e2e.ts` / `e2e/outliner-range.e2e.ts` の camelCase 改名                                             | **R7**                                      | Playwright の `testMatch: '**/*.e2e.{ts,js}'` はパターン一致なので改名に非依存                                                |

**client 外に漏れるパス参照は3箇所だけ**(洗い出し済み): root `vite.config.ts`(#10)、`knip.json`(#14)、root `CLAUDE.md`(#17)。`playwright.config.ts`(`testMatch: '**/*.e2e.{ts,js}'`)と root `package.json` の scripts(`vp run --filter './packages/*' test` 等)は**改名・移動に非依存**でグロブ/フィルタのみ。

### 10.6 緑の定義

本リポジトリに **CI はない**(`.github/workflows` なし)。検証はローカルの `vp check` / `vp test` と git hooks(`pre-commit` → `vp staged`、`pre-push` → `knip`)のみ。

|                         | R1     | R2  | R3  | R4  | R5  | R6  | R7  |
| ----------------------- | ------ | --- | --- | --- | --- | --- | --- |
| `vp check`(fmt/lint/型) | ✅     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| node テスト             | ✅(空) | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| browser テスト          | —      | —   | —   | —   | —   | ✅  | ✅  |
| CLI integration         | ✅     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| e2e                     | —      | —   | —   | —   | —   | ✅  | ✅  |
| knip                    | —      | —   | —   | —   | —   | —   | ✅  |

**`vp check`(型検査)を全 R で必須にするのが要点。** React 化の失敗はほぼ型で出るので、ここを緩めると R6 に全部のツケが回る。

**knip は R7 に集約する。** R1 が `.svelte` を全部消しつつ PM 資産・`lib/sync/*`・`lib/dbSchema.ts` を残すため、R3/R4 で参照が戻るまでそれらは孤立ファイルになり `pre-push` の knip が落ちる。**それまでの push は `--no-verify` で通す。**

**却下**: `knip.json` に一時 ignore を足して R7 で剥がす(捨てる設定を書き、剥がし忘れのリスクを作る)。R1 で PM 資産等も一旦削除し R3/R4 で git から復活させる(「そのまま移設」を削除→復活の2手にするだけで、復活漏れのリスクを足す)。

### 10.7 チケット化

**P1〜P3 / R1〜R7 の10本は、実行フェーズの最初のセッションが本章から `gh issue create` で起こす。** ラベルは `wayfinder:*` ではなく実行用の別系統を使う(地図 #14 の子 Issue は decision ticket のみに保つ — 実行チケットをぶら下げると frontier が実行チケットで埋まり、地図が構造上いつまでも閉じない)。

---

## 付録 A: 実測で潰したリスク

実行者が同じ調査を繰り返さないための事実の記録。

1. **`useEffectEvent` は React 19.2.8 の安定版に入っている** — `react` の dev/production 両ビルドが `exports.useEffectEvent` を出し、`@types/react@19.2.17` でも `index.d.ts` に型がある(§4.3)。
2. **`react/exhaustive-deps` は `useEffectEvent` を誤検知しない**(実測)。lint が敵視するなら R3 が詰んでいた(§9.3)。
3. **`createViteConfig` は `app.html` を直接参照していない** — SvelteKit が見つけていた。素の Vite は `root` 直下の `index.html` を探すので、`src/app.html` → `packages/client/index.html` の移動は**必須**。同時に client `package.json` の `files` に `index.html` を足さないと**公開パッケージが壊れる**(§1.8)。
4. **`packages/client/.svelte-kit/` が作業ツリーに実在する**(gitignore 済み)。R1 で SvelteKit を落としても `tsconfig.json` の古い `extends` がここを解決し続け、**「型検査が通っている」偽陽性**が出る。R1 の手順に明示的な削除が必要(§10.5 #3)。
5. **`pnpm-workspace.yaml` の `overrides.typescript: 'catalog:'`** には「`@sveltejs/kit` が peers に `typescript ^5||^6` を要求するので workspace 全体で 7 を強制する」というコメントが付いている。kit が消えれば**この override 自体が不要になる可能性**がある(R7 で検証)。
6. **`prosemirror-view` の `editHandlers` ゲート** — `view.editable || !(event.type in editHandlers)`(`prosemirror-view@1.42.1`)。`editable: false` では keydown ハンドラが呼ばれない(§4.6)。
7. **`LocalizedStringDictionary` の `defaultLocale` は `'en-US'` 固定** — 辞書キーを `'en'` / `'ja'` にすると `fr-FR` ブラウザで TypeError(§6.3)。
8. **`LocalizedStringFormatter.format()` はプレーン文字列にパラメータ補間しない** — 補間が効くのは関数のときだけ(§6.1)。
9. **RAC には `typeahead={false}` と focusedKey 制御の公開プロパティがない**(§5.2)。
10. **oxlint の `plugins` は既定セットを上書きする**。既定セットは実質 `['eslint','unicorn','typescript','oxc']`(§9.3)。
11. **client `dbSchema` と CLI `dbInputSchema` は1文字も違わない**。`defaultDb()` / `emptyDb()` も本文同一(§9.2)。
12. **`@handlewithcare/react-prosemirror@3.2.7` は peer に `prosemirror-view: 1.42.0` を完全固定**しており、catalog の `^1.42.1` と噛み合わない(§4.1)。

## 付録 B: 決定の出典

| 本文書の章                 | 決定チケット                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §1 土台                    | [#18 React アプリの土台](https://github.com/yuheiy/note-first-presenter/issues/18)(本文 + 修正コメント)、調査 [#16](https://github.com/yuheiy/note-first-presenter/issues/16)                                            |
| §2 外部境界                | [#20 状態管理方針](https://github.com/yuheiy/note-first-presenter/issues/20) §1                                                                                                                                          |
| §3 状態管理                | [#20](https://github.com/yuheiy/note-first-presenter/issues/20)(+ 注記コメント)                                                                                                                                          |
| §4 Outliner                | [#21 Outliner の React 統合方針](https://github.com/yuheiy/note-first-presenter/issues/21)                                                                                                                               |
| §5 UI コンポーネント       | [#22 UI コンポーネント構成](https://github.com/yuheiy/note-first-presenter/issues/22) §1〜§5・§8〜§11、調査 [#15](https://github.com/yuheiy/note-first-presenter/issues/15)                                              |
| §6 i18n                    | [#19 i18n 方式](https://github.com/yuheiy/note-first-presenter/issues/19) + [#22](https://github.com/yuheiy/note-first-presenter/issues/22) §7(改)、調査 [#17](https://github.com/yuheiy/note-first-presenter/issues/17) |
| §7 ディレクトリ構成        | [#22](https://github.com/yuheiy/note-first-presenter/issues/22) §6(改)・§6b                                                                                                                                              |
| §8 テスト戦略              | [#23 テスト戦略](https://github.com/yuheiy/note-first-presenter/issues/23)                                                                                                                                               |
| §9 ツーリング/ドキュメント | [#26 ツーリング/ドキュメント更新の範囲](https://github.com/yuheiy/note-first-presenter/issues/26)                                                                                                                        |
| §10 実行計画               | [#24 実行計画の形](https://github.com/yuheiy/note-first-presenter/issues/24) + [#26](https://github.com/yuheiy/note-first-presenter/issues/26) §8                                                                        |

## 付録 C: 主な却下案の索引

| 却下したもの                                                                 | 章                    |
| ---------------------------------------------------------------------------- | --------------------- |
| React Router framework mode / TanStack Start                                 | §1.1                  |
| MPA 2エントリ(`index.html` + `slideshow/index.html`)                         | §1.2                  |
| `__NFP_STATIC__` 相当の define 定数                                          | §1.4                  |
| static が `/api/db` を拡張子なしファイルで出す(逆向きの URL 統一)            | §2.2                  |
| zustand / jotai / TanStack Query / `use()`+Suspense / `useSyncExternalStore` | §3.1 / §3.5           |
| `Workspace` + `editable` prop への一本化                                     | §3.4                  |
| react-prosemirror 系(`@handlewithcare/react-prosemirror` 等)                 | §4.1                  |
| latest-ref パターン / 親側 `useCallback`                                     | §4.3                  |
| 空 doc で即マウントして後で差し替える                                        | §4.4                  |
| echo 抑制の boolean フラグ                                                   | §4.5                  |
| Outliner の編集版/閲覧版への分割                                             | §4.6                  |
| `onChange` に `groupCount` / PM `Node` を同梱                                | §4.7                  |
| 独自の軽量ツリー JSON / Markdown 風アウトライン / `version: 2`               | §4.7                  |
| `@react-aria/utils` の `isMac()`                                             | §4.9                  |
| `ToggleButton`(`aria-pressed`)                                               | §5.3                  |
| `tailwindcss-react-aria-components` / `tailwind-merge` / `tailwind-variants` | §5.4                  |
| アイコンの SVG 直書き                                                        | §5.5                  |
| ICU JSON + 自前 Vite プラグイン(S2 の完全同型)                               | §6.2                  |
| `I18nProvider` をアプリに置く                                                | §6.4                  |
| 薄い hook `useMessages()`(退避案としては残す)                                | §6.5                  |
| `react-aria` を直接依存に入れる                                              | §6.6 / §6.9           |
| `src/outliner/` トップレベル / `features/*` 軸 / テストの隣接配置            | §7.5                  |
| Slidev 型(中間層ゼロ) / 全部 Chromium 1プロジェクト / 拡張子キー             | §8.2                  |
| RTL(`@testing-library/react`) / `@react-aria/test-utils` / `renderHook`      | §8.3 / §8.4           |
| dead-code マーカーの文字列差し替え                                           | §8.8                  |
| `jsx-a11y` / `react-perf` / `lib/` の React-free を lint 強制                | §9.3                  |
| db スキーマ重複を契約テストで守る                                            | §9.2                  |
| 並行パッケージ / Svelte・React の一時共存 / knip の一時 ignore               | §10.1 / §10.2 / §10.6 |
