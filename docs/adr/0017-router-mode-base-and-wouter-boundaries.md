# `routerMode` と `base` を導入し、wouter を境界付きで使う

Amends: ADR-0014(ルーティングに関する判断のみ)

CLI に **`routerMode`(`'hash' | 'history'`、既定 `'history'`)** と **`base`** の2オプションを持つ。HTML は `index.html` 1枚とその複製 `404.html` だけ。スライド番号はパスに置かず **`?slide=` の search param**。役割は3分割する: **URL からページを選ぶのは wouter**(`App.tsx` の `Router`/`Switch`/`Route` + モードで選んだ location フック)、**URL を組むのは `lib/urls.ts` の純関数**、**slide の state と URL ミラーは `activeSlideAtom`**(`components/slides/activeSlide.ts`、jotai の `atomWithStorage`)。名前と2値は Slidev の同名オプションから借りた。

## 設計決定

### URL 設計: スライド番号は search param

|         | ワークスペース     | スライドショー                           |
| ------- | ------------------ | ---------------------------------------- |
| history | `/` ・ `/?slide=3` | `/slideshow` ・ `/slideshow?slide=3`     |
| hash    | `/` ・ `/?slide=3` | `/#/slideshow` ・ `/?slide=3#/slideshow` |

- **スライド1は常にパラメータ無し**で、`/1` にあたる URL は存在しない(`?slide=1` はミラーの書き戻しが消すので、リダイレクト専用コードはゼロ)。
- 核心は**スライド番号がルーティングから完全に外れる**こと。ページ判定は `/slideshow` かどうかの1つだけで、「`/999` と `/typo` の区別」という問いが問題ごと消える(スライド総数は `meta.json` を待つまで分からないので、URL からは原理的に判定できない)。
- **hash モードでも query は `#` の前**(実 `location.search`)。クエリはクエリとして扱われるべきで、`URLSearchParams` がそのまま読め、DevTools にもサーバログにも現れる。これは wouter のネイティブな形状でもある: `use-hash-location` の `navigate` は query を実 `location.search` に書き、`useSearch` の既定は実 search を読む。
- hash モードへ何かを足すとき「サーバに届いてしまうから」を却下理由にしてはならない。hash モードの利得の根拠は「ルートがリクエストに含まれない」(`404.html` 不要・サブディレクトリで base 不要)という狭い事実だけである。

### wouter の使用境界

採用するのは `Router`/`Switch`/`Route` と `useBrowserLocation`/`useHashLocation`(モードで選ぶ)だけ。以下は**使わない**。それぞれ 3.10.0 のソースで確認した機械的な理由がある:

- **`<Link>` を使わない。** click ハンドラは修飾キーとマウスボタンしか見ず、`target` 属性を無視して `preventDefault()` → in-document `navigate()` する。このアプリ唯一のリンク — スライドショーを `target="nfp-slideshow"` で別窓に実ロードする RAC の `Link` — がちょうど壊れるケースで、回避策も無い。href は `urls.ts` の `slideshowHref` が組む(このアプリ唯一のディープリンク生成器。wouter の href ビルダはドキュメント相対の `#/slideshow` 形式を作る装置なので代替にならない)。
- **`useSearchParams` を使わない。** hash モードの `navigate` は `if (search)` 分岐で空クエリを消せず、スライド1に戻れなくなる。slide は `activeSlideAtom` が持つ。
- **path 無し Route(と `path="*"`)をフォールバックにしない。** regexparam の `*` は先頭 `/` を要求し、wouter は base 外の location を `~` 前置で返すため、base 外の URL では**どの Route もマッチせず白紙になる**。読めない URL は全てワークスペースに落とす(ページに解決しない URL を作らない)ため、キャッチオールは `path={/.*/}`。
- **`base` は末尾スラッシュを落として渡す**(wouter は素の `slice` で剥がす)。hash モードでは base を渡さない — ルートは hash の中にあり、配信の深さと無関係。

これらの境界は `src/__tests__/routing.browser.test.tsx` が**出荷する構成そのもの**(実 wouter + 実 location)で釘打ちしている。依存の更新でここの挙動が変わればそのテストが割れる。

### `activeSlideAtom`: URL は storage である

slide の正は atom、URL はブックマーク可能なミラー。jotai の語彙では「この atom の storage は URL の search param」— `atomWithStorage` にカスタム storage を渡す:

- `getItem` は起動時の1回だけ(`getOnInit: true`。node の import 安全のため `window` ガード付き。既定の遅延読みだと初回レンダーが1フレーム slide 1 になる)。
- `setItem` は毎回 `replaceState`。**`push` にしない**: slide はキャレットに追随するので、push だと `---` をまたぐたびに履歴が積まれる。
- `subscribe` を定義しない = **書き込み専用ミラー**であることがインターフェース上の事実になる。
- これで History API の使い分けが構造になる: **search はスクリプトが replace で書き、path/hash はブラウザの実ナビゲーションだけが書く**。1ゾーンにつき書き手は1つ。
- slide 1 の削除正規化と他人の query param(共有リンクの tracking tag 等)の温存は `urls.ts` の `applySlideParam` に1本化。

### 単一の HTML と、その複製

`404.html` は history モードで**主機能が動くための必須条件**(スライドショーは別窓への実 HTTP リクエストなので `GET /slideshow` が実際に飛ぶ)であって、ディープリンクへの配慮ではない。モードに関係なく無条件で出す。`_redirects` / `vercel.json` は出さない。

### `base`

config のトップレベル + CLI 上書き(CLI が勝つ。GitHub Actions の `--base /${{ … }}/` は config に書ける値ではない)。Slidev はサブディレクトリ配信に hash を勧めるが、既定 history のまま base で正面から解く。

### URL の合成は `lib/urls.ts` が唯一の所有者

モードと base の組み合わせはどれも「ちょうど1通り」しか正解がなく、間違えても型検査を通り、ルート直下では正しく動き、**サブディレクトリに置いた時だけ壊れる**。だから合成は `urls.ts` に集約して e2e(`e2e/subpath/`)で1度だけ踏む。合成とマッチングの往復(組んだ href が名指したページを開くこと)は `routing.browser.test.tsx` が両モードで確認する。個々の規則の正本は各ファイルのコメント。

### その他の決定(詳細の正本はコード側コメント)

- **モードの伝達は `define` 定数**(最初のレンダリングに必要なので fetch では遅い)。定数を直接読むとテストできないので、`App` も `composeSlideshowHref` もモードと base を引数で受け、定数を束ねるのは `main.tsx` だけ。
- **dev も起動時の config エラーで即座に落とす**(間違った `routerMode` で動いているのか見分けられないため)。実行中の編集エラーは劣化して報告する。
- **dev ミドルウェアは `configureServer` 内で直接 `use(base, mw)` する。** 後置フックは vite-plus の `htmlFallbackMiddleware` に先を越されて `/nfp-data/*` に到達しない。base を剥がすのは connect のマウント機構の仕事。

## Considered Options

- **`'memory'` を3値目に**: 却下。別窓に「お前はスライドショーだ」と伝える手段が URL しか無く、主機能が成立しない。
- **スライド番号をパスに置く(Slidev の `/slideshow/3`)**: 却下。得られるのはディープリンクの見た目だけで、「slide index がルーティングに関与しない」性質の方が大きい。
- **hash モードで query をハッシュの中に**: 却下。クエリがクエリとして扱われなくなり、wouter の読み書きの既定(実 search)とも食い違う。
- **`/` を `/1` に正規化**: 却下。共有 URL が `/`(静的ホスト上に実在するファイル)のままになる方を選んだ。
- **404 ページを作る**: 却下。2ページのアプリに3ページ目を足す価値がない。読めない URL は `/` に落とす。

## Consequences

- ルートは live になった(wouter が popstate/hashchange を購読する)。手で hash を書き換えるとリロード無しにページが切り替わる。一方 in-document 遷移を**書く**コードは存在せず、生まれた日には location フックの配線がそのまま受け皿になる。
- wouter は import しただけで `history.pushState`/`replaceState` をモンキーパッチしてイベントを発火させる。`activeSlideAtom` の `replaceState` もこれを踏むが、pathname のスナップショットが不変なので再レンダーは起きない。
- 既定が history なので、rewrite 非対応ホストではスライドショーが `404.html` 経由で開く(URL は保持、ステータスは 404)。hash モードならその依存も消える。
