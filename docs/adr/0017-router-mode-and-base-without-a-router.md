# `routerMode` と `base` を導入し、ルータライブラリは入れない

Amends: ADR-0014（ルーティングに関する判断のみ。React 採用そのものは有効）

CLI に **`routerMode`（`'hash' | 'history'`、既定 `'history'`）** と **`base`** の2オプションを足す。HTML はルートごとに出力せず、`index.html` 1枚とその複製 `404.html` だけで両ルートをまかなう。スライド番号はパスから外し、**`?slide=` という search param** に移す。URL に関する知識は `packages/client/src/lib/routes.ts` 1本に集約する。

**ルータライブラリは入れない。** ADR-0014 の同じ判断を維持する。この ADR の作業では一度 wouter を入れて完成させたうえで剥がしており、その経緯は下記 §ルータライブラリを入れない に記録する。

## 動機

共有される静的サイトの URL から `#` を消したい。ADR-0014 は hash 固定を選び、その代償として `200.html` フォールバックとサブディレクトリ問題を構造的に消していたが、URL の見た目という一点を買い戻すために、その代償を選べるようにする。

Slidev から借りるのは **`routerMode` というオプション名と、`'hash' | 'history'` という2値だけ**である。Slidev の `routerMode` は `packages/types/src/frontmatter.ts` で同じ2値に定義されており、**`'memory'` は存在しない**。URL の形は下記のとおり nfp 独自で、Slidev はスライド番号をパス（`/:no`）に置く。

## 設計決定

### URL 設計: スライド番号は search param

|         | ワークスペース     | スライドショー                           |
| ------- | ------------------ | ---------------------------------------- |
| history | `/` ・ `/?slide=3` | `/slideshow` ・ `/slideshow?slide=3`     |
| hash    | `/` ・ `/?slide=3` | `/#/slideshow` ・ `/?slide=3#/slideshow` |

**スライド1は常にパラメータ無し**で、`/1` にあたる URL は存在しない。`?slide=1` で開かれた場合は `useActiveSlide` の書き戻しがそのまま消すので、リダイレクト専用のコードは1行も無い。

この選択が効いているのは、**スライド番号がルーティングから完全に外れる**ことである。ページの判定は `/slideshow` かどうかの1つだけになり、「`/999`（存在しないスライド）と `/typo`（ただの誤り）をどう区別するか」という問いが問題ごと消滅する。スライド総数はクライアントが `meta.json` を待つまで分からないので、URL の形からは原理的に判定できなかった。

**hash モードでも query は `#` の前**（実 `location.search`）に置く。**クエリはクエリとして扱われるべきだ**、というのが理由である — `location.search` にあれば `URLSearchParams` がそのまま読み、DevTools のネットワークタブにもサーバログにもクエリとして現れる。ハッシュの中（`/#/slideshow?slide=3`）に入れると、`location.search` は空になり、切り出しを自前で持つことになる。

したがって hash モードでも `?slide=3` はサーバに届く。**ADR-0014 の「hash はサーバに届かない」という主張は本 ADR で破棄する**（下記）。守るべき性質として扱わない。

### ADR-0014 の「hash はサーバに届かない」を破棄する

ADR-0014 は hash モードの取り柄として次のように書いていた。

> **hash はサーバに届かない**ので、静的配信の SPA フォールバック問題（ADR-0007 の `200.html`）そのものが消滅する。

**この主張は破棄する。** `?slide=` を実クエリに置いた時点で成り立たなくなったが、破棄するのは「成り立たなくなったから」ではなく、**それを守るべき性質として持ち歩くのをやめるから**である。上のとおり、クエリがクエリとして扱われることの方を優先した。今後 hash モードに何かを足すとき、「サーバに届いてしまうから」を却下理由にしてはならない。

一方で **`404.html` に関する結論そのものは変わらない**。hash モードがフォールバック文書を必要としないのは「サーバに何も届かない」からではなく、**ルートがリクエストに含まれない**からである（`GET /?slide=3` も `GET /` も、返るべき文書は `index.html` 1枚）。同じ理由で hash モードはサブディレクトリ配下でも base を知らずに動く。必要なのはこの狭い事実だけで、それ以上の一般則は要らない。

### 単一の HTML と、その複製

ルートごとの HTML は出力しない（ADR-0014 が MPA 2エントリを却下した理由がそのまま生きている）。代わりに `index.html` の複製を **`404.html`** として出す。Slidev も同じことをしている（`node/commands/build.ts:123`）。

これは history モードにおいて**主機能が動くための必須条件**であって、ディープリンクへの配慮ではない。スライドショーへの遷移は `target="nfp-slideshow"` 付きのリンク、つまり**新しい文書のロード = サーバへの実 HTTP リクエスト**であり、history モードでは `GET /slideshow` が実際に飛ぶ。`index.html` が返らなければスライドショーの窓は 404 で終わる。

`404.html` は**モードに関係なく無条件で出す**（Slidev と同じ）。hash モードのサイトはそこに到達しないので、出し分ける実装コストに見合う利得がない。`_redirects`（Netlify）や `vercel.json` は出さない — nfp が特定のホストを想定している証拠が repo のどこにもないのに、`dist/` に正体不明のファイルを増やすことになるため。

### `base`: ADR-0014 の事実誤認の訂正でもある

ADR-0014 は「ハッシュのみの相対 URL なのでサブディレクトリ配下でもそのまま動く」と書いているが、**これはリンクについてしか成立していなかった**。ビルド成果物の `<script src="/assets/…">` も `/nfp-data/*` も origin 絶対で、`https://user.github.io/repo/` に置いた瞬間にサイト全体が壊れる。つまりサブディレクトリ配信は当時から動いていない。

`base` の名前と CLI フラグは Slidev から借りたが（Slidev では CLI 専用、`node/cli.ts:107,353`）、置き場所は nfp の既存慣習に揃えて **config のトップレベル + `dev`/`build` 両方の CLI 上書き**とした。`--out-dir` と同じく CLI が勝つ。`base` の CLI 上書きは実務上必須で、GitHub Actions の定型行 `--base /${{ github.event.repository.name }}/` は config ファイルに書ける値ではない。

なお Slidev は `base` を持ちながら、GitHub Pages のサブディレクトリ配信には hash を勧めている（`--router-mode` の describe が "hash for subdirectory deploys like GitHub Pages" と言い切っている）。本 ADR は既定を history にしたまま base で正面から解く側を選んでおり、**Slidev が勧めていない構成を第一級でサポートする**。これは意識的な選択である。

### `lib/routes.ts` が URL 空間の唯一の所有者

`packages/client/src/lib/routes.ts` に、ルートの読み取り・href 生成・`nfp-data/` の URL・`?slide=` の読み書きを集約する。

集約の理由は整理整頓ではなく、**モードと base の組み合わせがどれも「ちょうど1通り」しか正解を持たないから**である。

- **base の付け方が用途で違う。** `import.meta.env.BASE_URL` は必ず末尾スラッシュ付きなので、`dataUrl()` は `BASE + 'nfp-data/…'` でよい。一方ルートの読み取りは `pathname.slice(BASE.length)` で、そのスラッシュに依存して先頭スラッシュが落ちる形になっている。
- **hash モードでは base を一切使わない。** ハッシュ空間は文書の置き場所と無関係に `/` から始まる。これは hash モードがサブディレクトリで無設定のまま動く理由そのものであり、逆に history モードでは base を知らないと何も解けない。
- **`?` の置き場所がモードで違う。** history では path の後ろ、hash では `#` の前。
- **スライドショーの href は base から始めなければならない。** `#/slideshow` のようなハッシュだけの相対 URL は現在の文書に対して解決されるので、**現在のクエリを引き継いでしまう**。スライド1のスライドショーを開いたのにスライド3が出る、という壊れ方をする。

この4つはどれも「間違えても型検査を通り、ルート直下では正しく動き、サブディレクトリに置いた時だけ壊れる」種類の知識なので、1箇所にまとめて e2e で1度だけ踏む形にしてある。

### ルータライブラリを入れない

この ADR の作業では、いったん **wouter 3.10 を入れて全機能を完成させ、テストを通したうえで剥がした**。同じ判断を再検討する人のために、剥がした理由と、その過程で判明した wouter 固有の事実を残しておく。

剥がした決め手は **`navigate` が1回も呼ばれていなかった**ことである。スライドショーは常に別窓（`target="nfp-slideshow"`）で開き、戻る導線もないので、**このアプリにはクライアントサイド遷移が1つも存在しない**。ルータは文書ごとに1度マッチして終わる。スライド番号を `?slide=` に移したことでパスパラメータも消えたので、ADR-0014 の「ルータが解く問題（マッチング・履歴・遷移）が1つも発生しない」という判断は、当時より強くなっていた。

wouter から実際に受け取っていたのは、ルート照合（2本、うち1本は catch-all）、location hook の差し替え、`hrefs` による `'#'` の前置、`useSearch` の購読の4つだけだった。自前で書くと `resolveRoutePath` の約8行に収まり、**`useSearch` の購読に至っては不要**である — `?slide=` を書くのはこのアプリだけで、常に `replace` なので popstate も来ない。つまり ADR-0014 の `useState` + 書き戻し effect で足りていた。

一方で、wouter を入れることで**3つの罠を抱え込んでいた**。いずれも wouter が無ければ存在しない。

- **`<Link>` は `target` 属性を一切見ない。** 修飾キーとマウスボタンだけを見て `preventDefault()` し、自前で navigate する（`index.js:286-303`）。React Router の `Link` は `target` を見て素通しするので、その感覚で書くと踏む。このアプリのリンクはスライドショーへの1本だけで、それがちょうど `<Link>` が壊す唯一のケースだった。回避策も無い — 自前の `onClick` で `preventDefault()` すれば wouter の navigate は止まるが、ブラウザが窓を開く既定動作も同時に止まる。
- **`<Router base>` は末尾スラッシュを許さない。** base の除去が `path.slice(base.length)`（`paths.js:5-7`）なので、`'/sub/'` を渡すと `'/sub/slideshow'` が `'slideshow'` になり先頭スラッシュが消えて何にもマッチしない。`hrefs` 側も `router.base + targetPath`（`index.js:307`）の素の結合なのでスラッシュが2連する。vue-router は base を内部で正規化するため、**Slidev にはこの問題が存在しない**。
- **`useSearchParams` は hash モードでクエリを消せない。** hash の navigate が `if (search) url.search = search` としか書かないので（`use-hash-location.js:33`）、`?slide=` を削除できずスライド1に戻れなくなる。

加えて、**負けた側の location hook はバンドルから消えなかった**（wouter の package.json に `sideEffects: false` が無いため、三項演算子が畳まれてもモジュールごと残る）。実測で 218KB 中の約 0.1KB と実害のない量だが、期待したとおりには効かない。

将来 in-document 遷移を足すならルータには価値が出るが、それは ADR-0014 が「投機的なルーティングに金を払わない」として既に却下した論法である。実際に遷移が生まれた時点で再検討すればよい。

### URL は `activeSlide` のミラー

ADR-0014 の形を維持する。`useState` が正で、`useEffect` が `replaceState` で URL に書き戻す。読むのは初期値の1度きりで、リスナは置かない。

`push` ではなく `replace` である理由は、ワークスペースの `activeSlide` が**キャレットに追随する**（`Outliner.tsx:41`）ことにある。push にすると `---` をまたぐたびに履歴エントリが積まれる。Slidev が push できる（`composables/useNav.ts:194`）のは、スライド移動が矢印キーとクリックという明示的な操作だけだからで、そこが構造的に違う。方針としては、**slide index の変更は replace、それ以外の遷移は push** — 後者に該当する遷移は現時点で存在しない。

### モードの伝達は `define` 定数

`base` はチャンネルが要らない（Vite が `import.meta.env.BASE_URL` として配る）。`routerMode` には無く、しかも**最初のレンダリング前に決まっている必要がある**ので `meta.json` の fetch では遅い。Slidev と同じく Vite の `define` に載せる（`__SLIDEV_HASH_ROUTE__`、`node/options.ts:129`）。ただし boolean ではなく **`'hash' | 'history'` の文字列リテラル**を運ぶ — boolean は「hash かそれ以外か」という非対称な聞き方になるため。

`packages/client/vite.config.ts` にも同じ `define` を書く。ADR-0014 の「正本は CLI 側、client の vite.config.ts はテスト/IDE 専用」という非対称の延長で、書かないとテストが `ReferenceError` で落ちる。型は `src/globals.d.ts` で宣言する。

**定数を直接読む関数はテストしにくい。** ビルドごとに片方の値しか存在しないので、`resolveRoutePath` / `composeSlideshowHref` はモードと base を**引数で受け取る**形にし、`__NFP_ROUTER_MODE__` を束ねるのは呼び出し側（`currentRoutePath`, `slideshowHref`）に限っている。

### dev も config エラーで即座に落とす

`routerMode` / `base` のために `cli.ts` の `dev` が config ファイルを読むようになった。これは**挙動変更を1つ伴う** — 従来の dev は config を自力で読まず、`ViteNfpPlugin` が読んで**エラー時は `no-config-no-file` に劣化**していたので、config に typo があってもサーバは起動していた。今は `build` と同じく exit 1 で落ちる。

**それを正とする。** config が読めない状態で起動したサーバは、スライドが解決できないだけでなく、**間違った `routerMode` で動いているのか既定で動いているのかが利用者から見分けられない**。ルーティングの設定を config から読む以上、その config が理解できないなら起動しない方が正しい。

一方で、**dev の実行中に config を編集したときの劣化は維持する**。書きかけの状態は編集中の正常な通過点であり、そこでサーバごと落とすのは害しかない。`onError` はサーバログとブラウザのエラーオーバーレイの両方に出るので、黙って壊れるわけでもない。つまり境界は「起動時は fail-fast、実行中は劣化して報告」である。~~`test/config.test.ts`~~ が起動時の側を固定している → integration 層の廃止に伴い `src/commands/__tests__/cliCommands.test.ts`（ADR-0021）。

### dev ミドルウェアは base にマウントする

`ViteNfpPlugin` のミドルウェアは `configureServer` の中で直接 `use()` する必要がある。**後置フック（`configureServer` から関数を返す）は使えない** — vite-plus 0.2.5 は `htmlFallbackMiddleware` を post hook の実行より前に `use()` しているので、後置フックは SPA フォールバックの後ろに並び、`/nfp-data/*` に一度も到達しない（実際にこれを踏んで、dev の e2e が全滅した）。

その早さの代償として、Vite の `baseMiddleware` はまだ走っておらず、`req.url` には base が付いたままである（`/sub/nfp-data/db.json`）。

**これを剥がすのは connect の仕事であって、ハンドラの仕事ではない。** マウント付きで登録する:

```ts
server.middlewares.use(server.config.base, createNfpDataMiddleware({ getSlidesStatus, getSlides }));
```

connect の `use(route, fn)` は登録時に route の末尾スラッシュを落とし（`'/sub/'` → `'/sub'`、既定の `'/'` → `''` すなわちマウント無しに退化する）、`parseUrl(req).pathname` に対して**セグメント境界付きで**照合し（`/subterranean/…` は当たらない）、一致したら `req.url` から prefix を外し、ハンドラが `next()` を呼べば元に戻す。ハンドラは base を知らないまま `/nfp-data/*` だけを話し続けられる。

当初はハンドラに `base` オプションを渡して先頭で自前に剥がしていたが、それは connect が持っている機構の再実装だった。境界チェックも `next()` 後の復元も自前では書いていなかったので、単に短くなっただけでなく正しくなっている。

## テスト

**e2e は `history` + `--base /sub/` の project を1本だけ足す**（`e2e/subpath/`）。今回作った機構のうち、壊れても静的に気づけないのは base の合流点だけだからである。base は「Vite の resolved base」「ルートの読み取り」「`dataUrl()`」「スライドショーの href」という4層が一致して初めて動き、実際に配信する以外に確かめようがない。

hash モードには e2e を置かない。モードの分岐は `lib/routes.ts` の中で完結するので、`resolveRoutePath` / `composeSlideshowHref` にモードを引数で渡す形にして unit テストで両モードを固定した。テストが固定している URL の形は、hash モードの実ビルドをブラウザで動かして読み取った実測値である。

`404.html` は**存在だけ**を検証する。`vite preview` が SPA フォールバックするので、preview 越しにその文書へ到達する経路が無い。GitHub Pages 上での実効性は未検証のまま残る。

## Considered Options

- **wouter を採用する**: 却下。§ルータライブラリを入れない のとおり、実装して剥がした。
- **`'memory'` を3値目に足す**: 却下。Slidev に存在しない。加えてスライドショーは `target="nfp-slideshow"` で別窓に開くので、URL が何も運ばない memory モードでは新しい窓に「お前はスライドショーだ」と伝える手段が無く、主機能が成立しない。
- **history モードでフォールバック文書を出さない**: 却下。rewrite 対応サーバ専用になり、GitHub Pages で壊れる。「URL を綺麗にしたい」人が真っ先に置く先で壊れるのは筋が悪い。
- **`base` を今回のスコープから外す**: 却下。`404.html` を出しても base 無しではプロジェクトサイト（GitHub Pages で最も多い形）が白紙になる。
- **`base: './'` で資産だけ相対化する**: 却下。hash モードなら成立するが、history モードではルートの読み取りが自分のマウント位置を知る必要があり、相対パスでは解けない。
- **`base` を別 ADR に分ける**: 却下。base の設計判断は routerMode の設計判断と同じ4つの合流点に乗っており、分けると根拠がもう一方の ADR にしか無い状態になる。
- **スライド番号をパスに置く（Slidev と同じ `/slideshow/3`）**: 却下。history モードでは `/3` の方が見た目は良いが、共有される URL はワークスペースのルート `/` であって両案で同じであり、差が出るのはディープリンクだけ。引き換えに得られる「slide index がルーティングに関与しない」という性質の方が大きい。
- **hash モードで query をハッシュの中に入れる（`/#/slideshow?slide=3`）**: 却下。クエリがクエリとして扱われなくなる（`location.search` が空になり、切り出しを自前で持ち、DevTools にもサーバログにもクエリとして現れない）。「サーバに何も届かない」は却下理由の裏返しとして持ち出せそうに見えるが、その主張は §ADR-0014 の…を破棄する のとおり破棄済みで、天秤に乗らない。
- **`/` を `/1` に正規化する（ADR-0014 と Slidev の挙動）**: 却下。逆向きに、`/1` を存在させない方を選んだ。共有 URL が `/` のままになり、しかもそれは静的ホスト上に実在するファイルなので、`404.html` を必要としない。
- **404 ページを作る**: 却下。2ページのアプリに3ページ目とメッセージ2件を足す価値がない。`resolveRoutePath` が読めない URL を `/`（ワークスペース）に落とすのがその代わりである。

## Consequences

- **ADR-0014 のルーティングに関する判断のうち、置き換わるのは URL の形だけになった**（hash 固定 → `routerMode`、スライド番号は hash のパス → `?slide=`、`200.html` 消滅 → `404.html` を無条件出力、サブディレクトリはハッシュ相対で解決 → `base`）。「ルータライブラリを入れない」「リスナを置かない」「URL は書き込み専用のミラー」「起動時に1度ページを選ぶ」はすべて**維持**である。0014 は superseded にしない。
- `components/slides/activeSlide.ts` とそのテストは `lib/routes.ts` に吸収された。`main.tsx` の起動時ハッシュ正規化ブロックは、スライド1が無印になったことで不要になり消えた。
- **クライアントの依存は1つも増えていない。** `note-first-presenter` 側も同様。
- `dev` コマンドが初めて config ファイルを読むようになった（それまでは `ViteNfpPlugin` が自前でスライドを解決するだけだった）。
- 既定が `history` になったので、`nfp build` の成果物をそのまま rewrite 非対応のルート直下ホストに置くと、スライドショーは `404.html` 経由で開く（URL は保持されるがステータスは 404）。hash モードを選べばその依存も消える。
