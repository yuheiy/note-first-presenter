# 対話的 UI プリミティブに React Aria Components を採用する

**フォーカス・キーボード・選択状態を伴う対話的 UI は保守されたヘッドレスプリミティブに委ね、ARIA の状態機械を自前で書かない。** ライブラリは React Aria Components (RAC)。相当物がある要素はすべて RAC を使い（`ListBox` / `Tooltip` / `Link` / `Button` / `TextField` / `RadioGroup`）、素の `<img>` や `role="status"` の告知 div は RAC 化しない。

採用の決め手は、単一のスタイリング規約（render props + `clsx`）で全要素を書けること、i18n の土台が同梱されること（ロケールの源はのちに Paraglide へ移り、RAC はそれに追従する形になった — ADR-0016）、`fieldset role="radiogroup"` や `asChild` のような綻びが `RadioGroup` / `Link` に素直に収まること。

## 設計決定

- **ラッパーコンポーネントは Tooltip だけ作る。** 本アプリのインタラクティブ要素は各1回しか使わないので、全プリミティブをラップするとファイルと間接参照が増えるだけ。Tooltip だけは矢印 SVG + 配置 + スタイルの塊が実際に2箇所で共有される（詳細は `components/Tooltip.tsx` のコメント）。
- **状態依存のスタイルは render props + `clsx`。** `data-[…]:` バリアントは使わず、RAC 由来でない条件（`listOpen` など）も同じ経路で書く。`tailwindcss-react-aria-components` / `tailwind-merge` / `tailwind-variants` は入れない。
- **アイコンは `@phosphor-icons/react` を deep import**（barrel は dev 起動時に約9000アイコンを解決する）。SVG 直書きは weight 変更が毎回手作業になるため退けた。
- **ListBox の前後送りは `<ListBox layout="grid">` に委ねる。** RAC の grid モデルは「Left/Right = コレクションの線形順の前後」で、1列ではこのアプリの要求と一致する。`layout` は markup に届かず（`role="listbox"` のまま、増えるのは `data-layout` だけ）、APG の listbox パターンは縦リストの Left/Right を規定していないので露出セマンティクスは自前ハンドラと同一。**RTL では RAC が Left/Right を入れ替えるが、スライドショーページの window keydown は入れ替えない** — RTL カタログを足す日は両方を見直すこと（現状ロケールは en/ja のみで `dir="ltr"` 固定）。
- **`<ListBox>` 要素自身をスクロールコンテナにする。** 「アクティブ項目を先頭へ寄せる」自前 effect はどのみち必要（RAC 内蔵スクロールは最小限スクロールのみで、エディタ側のカーソル移動による activeSlide 変化では発火しない）なので、自前と内蔵が同じ要素を相手にすることで綱引きを構造的に防ぐ。
- **一覧開閉ボタンは `Button` + `aria-expanded`**（disclosure）。`ToggleButton`（`aria-pressed`）は設定 on/off の表現なので不適。
- **`Radio` の選択インジケータの丸は自前で描く**（RAC はネイティブ input を視覚的に隠す設計のため）。
- PageUp/PageDown（±5 ジャンプ）は復活させない。ARIA listbox の標準キーバインドではない。
- typeahead は無効化せず受け入れる（数字タイプでスライドジャンプできるのは機能的プラス）。無効化自体は `SelectableCollectionContext` の `disallowTypeAhead` で可能。`ListBoxItem` の子が文字列でないため `textValue` は必須。

## umbrella の `react-aria` は入れない

RAC が再エクスポートするもの（`useLocale` / `isRTL` / `VisuallyHidden` 等）と RAC 自身のコンテキストだけを使う。`react-aria` を直接依存に足すと、catalog の RAC が `^1.x` キャレクトである限り**どうピンしても**将来2コピー入り得る（RAC 側のピンが上がるとエッジが割れる）。割れたときの症状はモジュールスコープ状態の二重化（`I18nContext` が割れると `useLocale` が `navigator.language` に落ちる、`useFocusVisible` のグローバル、`live-announcer` のシングルトン）で、型エラーにもテスト失敗にもならない。どうしても足す日は `overrides` に `react-aria: 'catalog:'` を置いてエッジごと潰すこと。

## RAC に寄せられないか総ざらいした結果、却下したもの（再調査の一周を省くための記録)

- **`Toolbar`**: `useToolbar` は ArrowLeft/Right を入力欄の例外なしに横取りし、同居するタイトル `TextField` のキャレット移動を壊す。
- **`Pressable`**（スライドショーのクリック送り）: 子に `tabIndex` と対話的 role を要求し、与えると Space でも発火して window の Space ハンドラと二重発火する。素の `onClick` + role なし div が正解。
- **`isCtrlKeyPressed`**（`@react-aria/utils`）: 判定内容は採用したが自前化した。react-aria の `isMac()` は iPhone で `false`、ProseMirror は `true` を返すため、検出が2系統になるのを避けて ProseMirror 由来の判定を `outliner/platform.ts` に一本化（マウス修飾キーとキーボード `Mod-` が必ず一致する）。
- **`@react-aria/test-utils`**: RAC の ListBox キーボード操作は「ライブラリの振る舞い」としてテスト対象外なので用途が無い。
- 相当物が無く据え置き: localStorage 永続化、BroadcastChannel sync、`routes.ts`、window keydown、先頭寄せスクロール、live region、Outliner 内部（ProseMirror 領域）。

## Considered Options

- **`@ark-ui/react`**: 却下。§動機 の3点がいずれも得られない。
- **手書きの ARIA 実装**: 却下。状態機械の再実装負担と a11y エッジケースの取りこぼし。
- **スタイル付きコンポーネントライブラリ（shadcn/ui 等）**: 却下。独自のラッパー層とスタイルの意見を持ち込み、「最小レイヤ」志向と衝突する。
