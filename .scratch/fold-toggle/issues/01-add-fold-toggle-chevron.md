Status: ready-for-agent

# Add clickable fold toggle (chevron) to Outliner

## What to build

子を持つ Note の脇にクリック可能な開閉トグル(シェブロン)を表示し、クリックで折りたたみ状態を切り替えられるようにする。現在、折りたたみはキーボード(`Mod-ArrowUp` / `Mod-ArrowDown`)でしか操作できず、発見可能性がない。

トグルは Outliner の decoration として実装し、Outline の内容には含めない。読み取り専用の Outliner でも動作すること。これは静的ビルド向け Viewer が折りたたみを「閲覧時の表示状態の操作」として継承するための前提である(Viewer では Outline の内容変更は禁止するが、折りたたみやスライド移動などの表示状態の操作は許可する、という決定に基づく。`.scratch/sveltekit-migration/issues/01` の議論を参照)。

## Acceptance criteria

- [ ] 子を持つ Note にのみトグルが表示され、葉の Note には表示されない
- [ ] クリックで折りたたみ状態が切り替わり、子の表示・非表示が連動する
- [ ] 読み取り専用(editable でない)の Outliner でもクリックで切り替えられる
- [ ] 既存のキーボード操作(`Mod-ArrowUp` / `Mod-ArrowDown`)の挙動は変わらない
- [ ] トグルは Outline の内容に含まれない(シリアライズ結果やコピー&ペーストに現れない)
- [ ] トグルに支援技術向けの名前と開閉状態が提供される
- [ ] client 層のテストで、編集可能・読み取り専用の両モードにおけるトグル動作を検証する

## Blocked by

None - can start immediately
