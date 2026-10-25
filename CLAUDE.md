# SousChef

冷蔵庫・食品庫の在庫管理から献立提案・レシピ提示までを行う、夫婦 2 人用の iPhone PWA。

## 必読

- 仕様: `docs/spec.md`（決定事項は D-xx で参照する）
- 開発プロセス: `docs/dev-process.md`（TDD サイクルと改善履歴）

## ルール

- TDD で開発する。テストを先に書き、Red を確認してから実装する
- 仕様が曖昧なときは推測で実装せず、ユーザーにインタビューして `docs/spec.md` に追記する
- 機能を 1 つ終えるごとに `docs/dev-process.md` の改善履歴に KPT を追記し、プロセス・この CLAUDE.md を必要に応じて更新する
- 当面は 1 世帯（夫婦 2 人）のみを想定する。複数世帯のための抽象化は入れない
- Claude API キーはフロントエンドに置かない（Supabase Edge Functions 経由）
- テストで実際の Claude API を呼ばない
