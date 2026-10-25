# 本番公開の手順

main ブランチに変更が入り CI がすべて通ると、GitHub Actions の `deploy` ジョブが次を自動で行います（`.github/workflows/ci.yml`）。

1. Supabase に DB のマイグレーションを適用
2. Edge Function（献立提案）と Claude API キーを反映
3. 画面をビルドして Cloudflare Pages に公開

下の「初回だけ行うこと」が終わるまでは、`deploy` ジョブは「設定が未登録のため公開をスキップしました」と表示して何もしません（CI は失敗しません）。

## 初回だけ行うこと

### 1. Claude API キー（Anthropic）

1. https://console.anthropic.com でアカウントを作り、API キーを発行する
2. **Billing → Limits で月の上限金額を設定しておく**（アプリ側でも 1 日 20 回までに制限しています。D-21）

### 2. Supabase（DB・ログイン・Edge Function）

1. https://supabase.com でアカウントを作り、新しいプロジェクトを作る
   - Region: **Northeast Asia (Tokyo)**
   - Database Password: 生成して控えておく（`SUPABASE_DB_PASSWORD`）
2. 控えるもの
   - Project Settings → General → **Project ID**（`SUPABASE_PROJECT_REF`）
   - Project Settings → API → **Project URL**（`VITE_SUPABASE_URL`）と **anon / publishable key**（`VITE_SUPABASE_ANON_KEY`。公開してよい鍵です）
   - Account（右上）→ Access Tokens → 新しいトークンを発行（`SUPABASE_ACCESS_TOKEN`）
3. ログインの設定（Authentication）
   - Sign In / Providers: **Allow new users to sign up をオフ**、Email はオン
   - Emails → **Magic Link** のテンプレートを `supabase/templates/magic_link.html` の内容に置き換える（6 桁のコードが届くようになります。D-15）
   - Email OTP Expiration: 600 秒
   - Users → **Add user** で夫婦 2 人のメールアドレスを登録する（「Auto Confirm User」にチェック）

### 3. Cloudflare（画面の公開）

1. https://dash.cloudflare.com でアカウントを作る
2. 右のサイドバーなどから **Account ID** を控える（`CLOUDFLARE_ACCOUNT_ID`）
3. My Profile → API Tokens → Create Token → テンプレート「Edit Cloudflare Workers」か、カスタムで **Account / Cloudflare Pages / Edit** の権限を持つトークンを作る（`CLOUDFLARE_API_TOKEN`）

Pages のプロジェクト（名前: `souschef`）は初回の公開時に自動で作られます。公開先は `https://souschef.pages.dev` です（名前が使われていた場合は Cloudflare の画面に表示される URL を使ってください）。

### 4. GitHub に登録する

リポジトリの Settings → Secrets and variables → Actions で登録します。

| 種類      | 名前                     | 値                          |
| --------- | ------------------------ | --------------------------- |
| Secrets   | `ANTHROPIC_API_KEY`      | 1 の API キー               |
| Secrets   | `SUPABASE_ACCESS_TOKEN`  | 2 のアクセストークン        |
| Secrets   | `SUPABASE_DB_PASSWORD`   | 2 の DB パスワード          |
| Secrets   | `CLOUDFLARE_API_TOKEN`   | 3 の API トークン           |
| Variables | `SUPABASE_PROJECT_REF`   | 2 の Project ID             |
| Variables | `VITE_SUPABASE_URL`      | 2 の Project URL            |
| Variables | `VITE_SUPABASE_ANON_KEY` | 2 の anon / publishable key |
| Variables | `CLOUDFLARE_ACCOUNT_ID`  | 3 の Account ID             |

### 5. 公開する

1. 開発ブランチを main にマージする（プルリクエスト経由）
2. GitHub の Actions タブで CI と `deploy` が成功するのを確認する

### 6. 2 人を許可リストに登録する

最初の公開でテーブルができたら、Supabase の SQL Editor で実行します（表示名は通知に使います。D-30）。

```sql
insert into public.allowed_members (email, display_name)
values ('夫のメールアドレス', '表示名'), ('妻のメールアドレス', '表示名');
```

### 7. Supabase の Site URL

Authentication → URL Configuration → **Site URL** を公開先の URL（例: `https://souschef.pages.dev`）にする。

## iPhone で使う

1. Safari で公開先の URL を開く
2. 共有ボタン → **ホーム画面に追加**
3. ホーム画面のアイコンから開き、メールアドレスを入れて届いた 6 桁のコードでログインする

アプリの更新は自動で反映されます（次にアプリを開いたとき）。

## 困ったとき

- **コードのメールが届かない**: Supabase 標準のメール送信は 1 時間あたりの送信数が少なく制限されています。続けて試すと届かないことがあります。時間をおくか、Authentication → Emails → SMTP Settings で独自のメールサーバを設定してください
- **「このアカウントでは使えません」と出る**: 6 の許可リストにメールアドレスが入っているか確認してください
- **献立の提案が失敗する**: Supabase の Edge Functions → suggest-meals → Logs を確認してください。API キーの残高や上限も確認してください
