# 対話的 UI プリミティブに React Aria Components を採用する

Supersedes: ADR-0011

> **Note（2026-07-27 に部分更新）**: 自前実装を RAC に寄せられないか総ざらいした結果、Consequences の **ArrowLeft/ArrowRight の手動フォーカス移動**が不要になり、**typeahead を無効化できない**という記述が誤りだと判明した。依存ピンの説明にも補足がある。詳細は末尾の追記（2026-07-27）を読むこと。中核判断（ヘッドレスプリミティブに委ねる / ラッパー層は重複が現れるまで作らない / umbrella の `react-aria` は入れない）はここでも存続する。

ADR-0011 の中核判断——**フォーカス・キーボード・選択状態を伴う対話的 UI は保守されたヘッドレスプリミティブに委ね、ARIA の状態機械を自前で書かない**——はそのまま存続させ、ライブラリを ark-ui (Svelte) から **React Aria Components (RAC)** に差し替える。相当物がある要素は**すべて RAC** を使う（`ListBox` / `Tooltip` / `Link` / `Button` / `TextField` / `RadioGroup`）。素の `<img>` や `role="status"` の告知 div は RAC 化しない。

## 動機

client を React へ書き直す（ADR-0014）以上、`@ark-ui/svelte` はそのままでは使えない。同じ思想の React 版（`@ark-ui/react`）に横滑りする道はあるが、RAC を採るとこのアプリで実際に効く差が3つある。

1. **単一のスタイリング規約で全要素を書ける。** `isSelected` / `isFocusVisible` / `isHovered` を render props で受ける形が RAC 要素にも内側の素の要素にも同じ経路で使える。ark-ui の `data-[state=…]` セレクタは要素ごとに属性名を調べ直すことになる。
2. **i18n の土台が同梱される。** ロケール解決は RAC の `useLocale()`（`I18nProvider` が無ければ `navigator.language` を検証して読み、`languagechange` も購読する）に完全に委ねられ、アプリ側にロケール解決コードが1行も要らない（ADR-0014 の i18n 段落）。ark-ui にこの層は無い。
3. **現行の綻びが構造的に消える。** テーマ切替の `<fieldset role="radiogroup">` + `bind:group`（fieldset 本来のグルーピング意味論を `role` で打ち消す書き方）が `RadioGroup` / `Radio` に、`asChild` で素の `<a>` を包むパターンが `Link` に素直に収まる。

## 設計決定

### ラッパーコンポーネントは Tooltip だけ作る

RAC 公式ドキュメントは `vanilla-starter/Button` のようなラッパー層を前提に書かれているが、あれはデザインシステムを作る側のテンプレートである。本アプリのインタラクティブ要素は全7箇所・各1回しか使わないので、全プリミティブをラップするとファイルを7つ増やして間接参照を1段深くするだけになる。Tooltip だけは矢印 SVG + 配置 + スタイルという塊が実際に2箇所で共有されるので `components/Tooltip.tsx` に切る。

- 矢印は維持する。RAC の `OverlayArrow` は配置と `data-placement` を与えるだけで描画はアプリ側なので、ラッパー内にインライン `<svg>` と placement による回転を持つ。
- `placement="bottom"` を明示する（RAC の既定は `top` だが、トリガはビューポート最上部にあり常に反転する）。
- ark-ui の `interactive` は廃止（RAC に対応物が無く、中身はプレーンテキストなので入る用事がない）。

### 状態依存のスタイルは render props + `clsx`

`data-[…]:` / `group-data-[…]:` バリアントは使わない（ADR-0011 が標準としていた書き方からの変更点）。RAC 由来でない条件（`listOpen` など）も同じく `clsx` で書き、経路を1つに保つ。

- **プラグイン `tailwindcss-react-aria-components` は入れない。** 記法の短縮だけを提供するもので、Tailwind と RAC 双方に追随する依存が1つ増える。
- 入れるユーティリティは **`clsx` のみ**。`tailwind-merge` / `tailwind-variants` は、クラス衝突の解決やバリアント定義が要るほどの規模ではない。

### ark-ui プロパティの対応

| ark-ui                            | RAC                                                                |
| --------------------------------- | ------------------------------------------------------------------ |
| `selectOnHighlight`               | `selectionBehavior="replace"`                                      |
| `deselectable={false}`            | `disallowEmptySelection`                                           |
| `loopFocus={false}`               | 指定不要（`shouldFocusWrap` の既定が無効）                         |
| `disallowSelectAll`               | 指定不要（単一選択では不要）                                       |
| `<Listbox.Label class="sr-only">` | `aria-label`（RAC の ListBox に `Label` サブコンポーネントはない） |

### アイコンは `@phosphor-icons/react` を deep import

`@phosphor-icons/react/dist/csr/<Name>`。エクスポート名（`PlayIcon` / `SidebarSimpleIcon`）も props（`size` / `weight` / `mirrored`）も `phosphor-svelte` と同一なので移植は機械的である。deep import は README 自身が推奨する形で、barrel import の「dev 起動時に約9000アイコンのバレルを解決する」問題も避けられる。`IconContext` は使わない。SVG 直書きは、duotone が2レイヤー構成でパスを手で持つと weight 変更や3つ目の追加が毎回手作業になるため退けた。

### Portal は不要

RAC にはポータルの汎用コンポーネントが無く、オーバーレイは既定で body へ自動ポータルされる。ポータル先を変える特殊ケースは本アプリに存在しないので、ark-ui の `Portal` に対応するものは置かない。

## Considered Options

- **`@ark-ui/react` に横滑りする**: 却下。移植は最も機械的だが、§動機 の3点（単一スタイリング規約 / i18n 土台の同梱 / `fieldset` と `asChild` の綻び解消）がいずれも得られない。zag-js への依存重量（ADR-0011 が受け入れたコスト）はどちらでも同じなので、払う先を選び直せる場面だった。
- **手書きの ARIA 実装に戻す**: 却下。ADR-0011 と同じ理由——キーボード・フォーカス・選択の状態機械を部品ごとに再実装する負担が大きく、a11y のエッジケースを取りこぼしやすい。
- **スタイル付きコンポーネントライブラリ（shadcn/ui 等）**: 却下。ADR-0011 と同じ理由——独自のラッパー層とスタイルの意見を持ち込み、「最小レイヤ」という本リポジトリの志向と衝突する。
- **全プリミティブに薄いラッパー層を用意する**: 却下。ADR-0011 が「重複が実際に現れるまで抽象化しない」と決めた判断をそのまま維持する。現に重複しているのは Tooltip だけである。
- **`@react-aria/test-utils` を使う**: 却下。RAC の ListBox のキーボード操作は「ライブラリの振る舞い」としてテスト対象外に置いた（`plans/react-rewrite-spec.md` §8.1 の N2）ので ListBox テスターの用途が無く、`1.0.0-rc.0` かつ peer に `@testing-library/dom` + `user-event` を要求するため RTL 一式を引き連れてくる。

## Consequences

- **ListBox の typeahead を無効化できない（唯一の非互換）。** RAC には `typeahead={false}` に相当する公開プロパティが無い。現行がこれを無効化していた理由はリポジトリ内のどこにも記述がなく、差分は機能的にプラス（数字をタイプしてスライドジャンプ）なので受け入れる。`ListBoxItem` の子が文字列でない（サムネイル + 番号 span）ため `textValue={String(n)}` はどのみち必須である。
- **ArrowLeft / ArrowRight の前後移動には手動フォーカス移動が要る。** これは ark-ui 時代にコメントで意図が明示されていた選択で、スライドショーページが Left/Right/Up/Down/Space/PageUp/PageDown をすべて前後送りに割り当てているのと一貫するので維持する。ただし **RAC には focusedKey を制御する公開プロパティが無い**ため、`selectedKeys` だけ動かすと DOM フォーカスが取り残され、続く Down が1つ戻ったように見える。ハンドラ内で対象項目（`[data-slide="…"]`）を引いて `focus({ preventScroll: true })` する。
- **ADR-0011 が廃止した PageUp/PageDown（±5 ジャンプ）は復活させない。** ARIA listbox の標準キーバインドではないという 0011 の判断は RAC でもそのまま当てはまる。
- **`<ListBox>` 要素自身をスクロールコンテナにする。** `overflow-y-auto` / パディング / `scroll-padding` を親パネルの `<div>` から `<ListBox>` へ移す（RAC 公式のスタイル例も `.react-aria-ListBox { overflow: auto }` を前提にしている）。親パネルの `<div>` に残るのは chrome と `container-type: size` で、後者は `--scroll-tail` の算出と `ErrorOverlay` の `absolute inset-0` の両方が依存している。「アクティブ項目を先頭へ寄せる」自前 effect は維持する。判断の要は**自前 effect がどのみち必要**な点である——RAC 内蔵のスクロールは (1)「先頭寄せ」ではなく「最小限だけ見える位置へ」で、(2) フォーカス変化時しか発火しないので**エディタ側のカーソル移動で activeSlide が変わったときには動かない**。したがって選択肢は「自前 effect を持つか」ではなく「自前と内蔵が同じ要素を相手にするか」であり、同じ要素にすれば綱引きが構造的に起こらない。親パネルの `<div>` はメタ未解決時のヒント/エラーの置き場として残る。
- **一覧開閉ボタンは `Button` + `aria-expanded`。** `ToggleButton`（`aria-pressed`）は採らない——隣接セクションの表示/非表示を制御するボタンは WAI-ARIA では disclosure（`aria-expanded`）で、`aria-pressed` は「太字」のような設定の on/off の表現である。
- **`Radio` の選択インジケータの丸は自前で描く。** RAC の `Radio` はネイティブ input を視覚的に隠す設計なので、ブラウザ既定のラジオの丸は使えない。代償はネイティブが無料でくれるもの（強制カラーモードでの見え方など）を自分で面倒みることで、描く場所は `.map()` 内の1箇所である。
- **依存の増減**: `@ark-ui/svelte` と `phosphor-svelte` を落とし、`react-aria-components` と `@phosphor-icons/react` と `clsx` を足す。**umbrella の `react-aria` は入れない** — RAC が `react-aria` を完全一致でピンしているため、こちらが `^3.50.0` と書くと将来2コピー入り得る。`useLocale` はコンテキストを読む hook なので、コピーが分かれると別の `I18nContext` を読み、ADR-0014 の i18n が依存しているロケール解決が静かにずれる。
- **ADR-0011 は本決定により superseded となる。** 撤回されるのはライブラリの選択と、それに紐づくスタイリング規約（`data-[state=…]` によるインライン Tailwind）だけである。0011 の残る判断——ヘッドレスプリミティブに委ねて ARIA の状態機械を自前で書かない / ラッパー層は重複が実際に現れるまで作らない / PageUp/PageDown は復活させない——は本 ADR が引き取っている。
- **テストの流儀は `vitest-browser-react`。** RAC の作者自身が `react-spectrum` の browser テストで使っており（`test/browser/setup.ts` の1行目が `import 'vitest-browser-react';`）、vitest browser mode の `userEvent` が Playwright 経由で実ブラウザのネイティブ入力を発火するので、jsdom の PointerEvent モックが要らない。層の構えは ADR-0005 とその追記を参照。

## 追記（2026-07-27）: ListBox の前後移動をライブラリに戻す / typeahead の記述の訂正 / 依存ピンの補足

client の自前実装のうち react-spectrum ファミリーに置き換えられるものを総ざらいした。結果として動いたのは1箇所だけで、本 ADR の判断はおおむね正しかった。以下は変わった点と、次に同じ調査をする人が一周省くための記録である。

### 1. ArrowLeft/ArrowRight の手動フォーカス移動を廃し、`layout="grid"` にする

本 ADR の Consequences は「RAC には focusedKey を制御する公開プロパティが無い」ため `[data-slide="…"]` を引いて `focus({ preventScroll: true })` すると決めていた。RAC 1.19 のソースを読み直したところ、`<ListBox layout="grid">` で同じ結果が得られる。

- **`layout` は markup に一切届かない。** `useListBox` は `role="listbox"` + `aria-orientation="vertical"`（`orientation` の既定値）を出し続ける。増えるのはスタイリング用の `data-layout="grid"` だけで、支援技術に伝わる内容は変わらない。1列のリストが grid を*名乗る*わけではない。
- **RAC の grid モデルは「Left/Right = コレクションの線形順の前後、Up/Down = 空間的な行移動」。** RAC 自身のテスト（`ListBox.test.js` の `should support grid layout`、`getBoundingClientRect` を2列でモック）が、行の先頭で Left を押すと前の行の末尾へ回り込むことをアサートしている。1列ではこの2つが一致するので、Up/Down は不変のまま Left/Right が前後送りになる。
- **APG の listbox パターンは縦リストの Left/Right を規定していない**（規定するのは Down/Up・Home/End・typeahead）。したがって自前ハンドラと露出セマンティクスは同一である。APG の _grid_ パターンは適用されない——`role="grid"` / `row` / `gridcell` を出さないため。むしろ grid として測ると RAC の1列時の挙動は APG と食い違う（grid の Right は行内移動で、右端では動かない）。つまり採用の根拠は「grid のセマンティクスを借りる」ではなく、**「Left/Right が線形順の前後だという RAC のモデルが、このアプリの要求と一致する」**である。
- **RTL では RAC が Left/Right を入れ替える。** スライドショーページの window keydown は入れ替えないので、RTL カタログを足す日は両方を見直すことになる。現状 `locales` は `en` / `ja` のみで `isRTL()` はどちらにも `false` を返すため `direction` は常に `ltr`、挙動は自前ハンドラと完全一致する。`index.html` の `dir="ltr"` が既にこの前提のチョークポイントになっている。

`SlideList.tsx` から消えたのは wrapper の `<div onKeyDown>` / `handleKeyDown` / `step` / `focus({ preventScroll: true })` / `stepSlide` の import。`data-slide` と `slideElement` は「アクティブ項目を先頭へ寄せる」effect が使い続けるので残り、本 ADR の当該項目（自前 effect と内蔵スクロールを同じ要素に向ける）はそのまま有効である。

テストは足していない。「RAC の ListBox のキーボード操作はライブラリの振る舞いとしてテスト対象外」という本 ADR の方針を維持する。ただし RAC 側に**1列での grid layout のテストは存在しない**（jsdom が2列、browser が3×3）ことは記録しておく。

### 2. 「ListBox の typeahead を無効化できない（唯一の非互換）」は誤り

RAC は `SelectableCollectionContext` を export しており、その値の `disallowTypeAhead: true` で切れる。当時「`typeahead={false}` 相当の _ListBox プロパティ_ が無い」ことは正しかったが、「無効化できない」は事実として誤りである。判断そのものは変えない——typeahead は機能的プラス（数字をタイプしてスライドジャンプ）として受け入れたままで、`textValue={String(n)}` も引き続き必須。

### 3. `react-aria` を直接依存にしない理由の補足

本 ADR は「こちらが `^3.50.0` と書くと将来2コピー入り得る」と書いた。これは正しいが、**完全一致でピンしても守れない**点を補っておく。catalog の `react-aria-components` は `^1.19.0` とキャレットなので、RAC 1.20 が `react-aria: 3.51.0` にピンし直せば、client 側を `3.50.0` に固定していてもエッジが割れて2コピーになる。RAC のリリース頻度のほうが高いため、完全一致ピンは「react-aria が publish されたら壊れる」を「RAC が上がったら壊れる」に付け替えるだけで、どちらも型エラーにもテスト失敗にもならない。

`@react-aria/utils` も同じ穴を持つ。3.34.1 は実装を持たない shim（`react-aria/private/utils/*` の再エクスポート）で、その依存は `react-aria: ^3.48.0` の**キャレット**である。

割れたときの症状はモジュールスコープ状態の二重化で、本 ADR §動機 2 が依存する `I18nContext`（コピーが分かれると `useLocale` が `useDefaultLocale()` → `navigator.language` に落ちる）のほか、`useFocusVisible` の `currentModality` などのグローバル、`live-announcer` のシングルトンが該当する。

確実な手段は2つある。

1. **足さない。** RAC が再エクスポートしているもの（`Pressable` / `Focusable` / `VisuallyHidden` / `RouterProvider` / `useLocale` / `isRTL` / `Collection` / `useFilter`）と RAC 自身のコンテキスト（`ListStateContext` / `SelectableCollectionContext`）だけ使う。エッジが1本なので割れようがない。
2. `pnpm-workspace.yaml` の `overrides` に `react-aria: 'catalog:'` を足し、RAC 経由のエッジごと1バージョンに潰す。代償は catalog の `vitest` に付いているのと同じ「独立に上げるな」という運用。

現時点で client が react-spectrum 系から欲しいものは無いので 1 を採っている。

### 4. 今回の見直しで却下したもの

- **ツールバーを RAC `Toolbar` にする**: `useToolbar` は ArrowLeft/Right を**入力欄の例外なしに**横取りする。Editor のタイトル `TextField` が同じツールバーに同居しているので、キャレット移動が壊れる。
- **スライドショーのクリック送りを `Pressable` にする**: `Pressable` は子に `tabIndex` と対話的 ARIA role を要求する（無いと dev で warn を出す）。与えると `usePress` が Space/Enter でも発火し、スライドショーが window に張っている Space ハンドラと**二重発火して2枚進む**。素の `onClick` のままにしてある——div が role も tabIndex も持たないことが、タブ順に入らず Space の対象にもならないことを保証している。
- **`itemMultiSelect` の修飾キー判定を `@react-aria/utils` の `isCtrlKeyPressed` にする**: 判定内容（`isMac() ? metaKey : ctrlKey`）自体は採用に値したので**自前で正規化した**。react-aria の `isMac()` は `/^Mac/i` を見るので iPhone で `false` を返すが、ProseMirror の `/Mac|iP(hone|[oa]d)/` は `true` を返す。プラットフォーム検出が2系統になるのを避け、ProseMirror 由来の判定を `outliner/platform.ts` に出して共有した（これならマウスの修飾キーとキーボードの `Mod-` が必ず一致する）。
- **相当物が無く据え置いたもの**: `theme.ts` / `listOpen.ts`（localStorage 永続化）、`useResource` / `createResourceLoader` / `createDbSaver`、`sync.ts`（BroadcastChannel）、`routes.ts`、スライドショーの window keydown（react-aria に window 直張りの hook は無い）、両所の `scrollIntoView({ block: 'start' })`（react-aria の `scrollIntoView` は「最小限だけ見える位置へ」で先頭寄せではない）、`Hint` / `ErrorOverlay` の live region、Tooltip の矢印 SVG、Radio の丸、Outliner 内部（ProseMirror 領域）、`SlideImage`。
