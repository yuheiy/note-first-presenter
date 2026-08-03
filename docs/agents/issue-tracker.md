# Issue tracker: GitHub

Issue と PRD はこのリポジトリの GitHub issues にある。操作はすべて `gh` CLI で行う（リポジトリはクローン内なら自動推定される）。

- 一覧の一括取得: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`
- スキルが「publish to the issue tracker」と言ったら issue を作る。「fetch the relevant ticket」と言ったら `gh issue view <number> --comments` を実行する。
- ラベル語彙: needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix。
