# 本番公開の手順

このアプリを夫婦 2 人の iPhone で使えるようにするまでの手順です。作業は全部で 1〜2 時間ほどです。

## 全体像

SousChef は 3 つのサービスを組み合わせて動きます。

| サービス                    | 役割                                                                              | 料金                                                     |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Supabase**                | データベース（在庫・レシピなど）、ログイン、献立提案のサーバ処理（Edge Function） | 無料プランで十分                                         |
| **Cloudflare Pages**        | 画面（HTML・JavaScript）を iPhone に配信する                                      | 無料                                                     |
| **Anthropic（Claude API）** | 献立とレシピを考える AI                                                           | 使った分だけ（1 回あたり数円。1 日 20 回までに制限済み） |

```
iPhone（PWA）──画面──▶ Cloudflare Pages
     │
     └──データ・ログイン・献立提案──▶ Supabase ──献立の生成──▶ Claude API
```

公開は自動です。GitHub の main ブランチに変更が入り、テストがすべて通ると、GitHub Actions が次を行います（`.github/workflows/ci.yml` の `deploy`）。

1. Supabase のデータベースを最新の形に更新する（マイグレーション）
2. 献立提案のサーバ処理（Edge Function）を更新する
3. 画面をビルドして Cloudflare Pages に公開する

下の手順が終わるまでは、`deploy` は「設定が未登録のため公開をスキップしました」と表示して何もしません。

---

## 鍵の扱い（安全のための設計）

公開の自動化には、各サービスを操作するための鍵（トークンやパスワード）が必要です。このリポジトリは**公開（public）リポジトリ**なので、鍵の置き場所には注意しています。

### 鍵はコードには書きません

鍵は GitHub の **Secrets**（暗号化された保管場所）に登録します。Secrets は次のように守られています。

- リポジトリのコードや履歴には含まれず、誰にも（登録した本人にも）値は表示されません
- 実行ログに値が出そうになると、GitHub が自動で `***` に伏せます
- 他人が送ってきたプルリクエスト（フォークから）のテストには渡されません

### さらに次の対策をしています

1. **Claude の API キーは GitHub に置かない**
   - 一番お金に直結する鍵なので、Supabase の画面で直接登録します（下の手順 2-5）。GitHub を経由しません
2. **鍵は main ブランチからの公開にだけ渡す**
   - GitHub の **Environment「production」** に鍵を置き、main からの実行だけが使えるように制限します（手順 4-1）。ほかのブランチや、プルリクエストのテストからは使えません
3. **鍵は使う手順にだけ渡す**
   - パッケージのインストール中に動くプログラムからは鍵が見えないようにしています
4. **鍵の権限を最小にする**
   - Cloudflare のトークンは「Pages の編集」だけ（手順 3）
   - 各サービスで利用上限を設定（手順 1-3、2-1）

### それでも残るリスクと、気をつけること

| 鍵                      | 漏れたときにできてしまうこと                                 | 対策                                                                                                               |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | このプロジェクトの Edge Function（献立提案の処理）の書き換え | 対象をこのプロジェクトだけ、権限を「Edge Functions」だけにする（手順 2-2）。漏れた疑いがあればすぐ削除して作り直す |
| `SUPABASE_DB_URL`       | データベースの読み書き（パスワード入りの接続文字列）         | 長いランダムなパスワードを使う（Supabase が生成するもの）。漏れた疑いがあれば DB のパスワードを変更する            |
| `CLOUDFLARE_API_TOKEN`  | 画面の書き換え                                               | Pages の編集権限だけにする                                                                                         |

- リポジトリに**他の人を共同編集者（Collaborator）として追加しない**でください（書き込みできる人はワークフローを書き換えて鍵を使えるため）
- 鍵を自動化に置くこと自体が不安な場合は、末尾の「付録: 手元から手動で公開する」の方法もあります（GitHub に鍵を置きません）

---

## 準備するもの

- メールアドレス（各サービスの登録用。夫婦どちらか 1 つで OK）
- 夫婦 2 人の、ログインに使うメールアドレス
- クレジットカード（Claude API の支払い用）
- パソコン（作業はブラウザだけで完結します）

作業中に控える値が 8 つあります。**メモ帳を開いておき**、下の「控える値」の名前で貼り付けていくと後が楽です。パスワードやトークンは、作業が終わったらメモ帳から消してください。

---

## 1. Claude API（Anthropic）

1. https://console.anthropic.com を開き、アカウントを作る
2. **Billing**（支払い）でクレジットカードを登録し、最初のクレジットを購入する（数ドルで十分です）
3. **Billing → Limits** で、月の上限金額（例: $10）を設定する
   - アプリ側でも 1 日 20 回までに制限していますが、念のためこちらでも上限を設けます
4. **API Keys → Create Key** で API キーを作る
   - 名前: `souschef`
   - 表示されたキー（`sk-ant-` で始まる）を控える → **`ANTHROPIC_API_KEY`**
   - この画面を閉じると二度と表示されません。控え忘れたら作り直してください

## 2. Supabase（データベース・ログイン）

### 2-1. プロジェクトを作る

1. https://supabase.com を開き、**Start your project** からアカウントを作る（GitHub アカウントでも登録できます）
2. **New organization** で、このアプリ専用の組織を作る
   - 名前: `souschef`、プラン: **Free**
   - 専用にしておくと、後で作るアクセストークンが他のプロジェクトに影響しません
3. **New project** でプロジェクトを作る
   - Name: `souschef`
   - Database Password: **Generate a password** を押し、表示されたパスワードを控える（手順 2-2 の接続文字列に使います）
   - Region: **Northeast Asia (Tokyo)**
4. 作成が終わるまで 1〜2 分待つ

### 2-2. 値を控える

1. 左下の歯車 **Project Settings → General** の **Project ID**（英字 20 文字ほど）→ **`SUPABASE_PROJECT_REF`**
2. **Project Settings → API**（または「Data API」）
   - **Project URL**（`https://xxxx.supabase.co`）→ **`VITE_SUPABASE_URL`**
   - **anon public** キー（または **Publishable key**）→ **`VITE_SUPABASE_ANON_KEY`**
     - これは画面に埋め込んで公開する前提の鍵で、知られても問題ありません（データはログインと許可リストで守られています）
     - **service_role**（または Secret key）は使いません。どこにも貼らないでください
3. プロジェクトの画面上部の **Connect** → **Connection String** タブ → **Session pooler**（ポート `5432`）の接続文字列をコピーする
   - `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres` のような形です
   - `[YOUR-PASSWORD]` の部分（角かっこも含めて）を手順 2-1 のパスワードに置き換えて控える → **`SUPABASE_DB_URL`**
   - 「Direct connection」ではなく **Session pooler** を使ってください（GitHub Actions からは Direct connection につながらないため）
4. アクセストークンを作る（**Edge Function の公開だけ**に使います）。右上のアカウントアイコン → **Account preferences → Access Tokens → Generate new token**

   | 項目                                                                                                                 | 設定                                                                                                        |
   | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
   | 名前                                                                                                                 | `souschef-github`                                                                                           |
   | 有効期限                                                                                                             | 1 年（選べる中で長めのもの。期限前に作り直す予定をカレンダーに入れる）                                      |
   | アクセスの範囲                                                                                                       | **プロジェクト**を選び、`souschef` 組織の `souschef` プロジェクトだけを選ぶ（「組織」や「すべて」にしない） |
   | 権限のプリセット                                                                                                     | 「アクセス不可」のまま始める                                                                                |
   | **アプリケーションサービス → Edge Functions**                                                                        | **読み取り/書き込み**（これだけを付ける）                                                                   |
   | ほかの項目（プロジェクト・データベース・インフラストラクチャ・アカウントと組織、アプリケーションサービスの他の項目） | すべて「なし」のまま                                                                                        |
   - **レビューアクセス**で、付いている権限が「Edge Functions: 読み取り/書き込み」だけであることを確認して作成
   - 表示されたトークン（`sbp_` で始まる）を控える → **`SUPABASE_ACCESS_TOKEN`**
   - 特に **API Key Secrets**（管理者用の秘密鍵が読める）と **Database Config**（DB のパスワードを変えられる）は付けないでください
   - 公開時に「権限が足りない（403）」と出たら、ログに不足している権限名が表示されます。その権限だけを付けて作り直してください（作成後は権限を変更できないため）

### 2-3. ログインの設定

左メニュー **Authentication** で設定します。

1. **Sign In / Providers**（または Providers）
   - **Allow new users to sign up** を**オフ**にする（知らない人が登録できないように）
   - **Email** はオンのまま
   - Email の設定で **Email OTP Expiration** を `600`（10 分）にする
2. **Emails → Templates → Magic Link**
   - Subject: `SousChef ログインコード`
   - Body: このリポジトリの `supabase/templates/magic_link.html` の中身を貼り付ける
   - これでログイン時に 6 桁のコードがメールで届くようになります
3. **Users → Add user → Create new user**
   - 夫のメールアドレスを入れ、**Auto Confirm User** にチェックして作成
   - 妻のメールアドレスも同じように作成
   - パスワードは空でかまいません（ログインはメールのコードで行います）

### 2-4. Site URL（後で設定）

Cloudflare の公開先 URL が決まってから設定します（手順 6）。

### 2-5. Claude の API キーを登録する

左メニュー **Edge Functions → Secrets**（または Project Settings → Edge Functions）で、

- Name: `ANTHROPIC_API_KEY`
- Value: 手順 1 で控えた API キー

を追加して保存します。これで献立提案のサーバ処理だけがこのキーを使えます。GitHub には登録しません。

## 3. Cloudflare（画面の公開）

1. https://dash.cloudflare.com/sign-up でアカウントを作る（無料プラン）
2. ログイン後のトップページ右側（または **Workers & Pages** の画面右側）にある **Account ID** を控える → **`CLOUDFLARE_ACCOUNT_ID`**
3. 右上のアカウントアイコン → **My Profile → API Tokens → Create Token**
   - **Create Custom Token** を選ぶ
   - Token name: `souschef-github`
   - Permissions: **Account** ／ **Cloudflare Pages** ／ **Edit** の 1 行だけ
   - Account Resources: **Include** ／ 自分のアカウント
   - **Continue to summary → Create Token**
   - 表示されたトークンを控える → **`CLOUDFLARE_API_TOKEN`**

Pages のプロジェクト（名前 `souschef`）は初回の公開時に自動で作られます。

## 4. GitHub に登録する

### 4-1. 公開用の Environment を作る

1. GitHub でこのリポジトリを開き、**Settings → Environments → New environment**
2. Name: `production`（この名前でないと動きません）→ **Configure environment**
3. **Deployment branches and tags** で **Selected branches and tags** を選び、**Add deployment branch or tag rule** で `main` を追加する
   - これで main からの公開にだけ鍵が渡されます

### 4-2. 鍵と値を登録する

同じ `production` の画面の下のほうで登録します。

**Environment secrets**（暗号化され、値は二度と表示されません）→ **Add environment secret**

| 名前                    | 値                                      |
| ----------------------- | --------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | 手順 2-2 のアクセストークン（`sbp_…`）  |
| `SUPABASE_DB_URL`       | 手順 2-2 の接続文字列（パスワード入り） |
| `CLOUDFLARE_API_TOKEN`  | 手順 3 の API トークン                  |

**Environment variables**（秘密ではない値。画面に表示されます）→ **Add environment variable**

| 名前                     | 値                                  |
| ------------------------ | ----------------------------------- |
| `SUPABASE_PROJECT_REF`   | 手順 2-2 の Project ID              |
| `VITE_SUPABASE_URL`      | 手順 2-2 の Project URL             |
| `VITE_SUPABASE_ANON_KEY` | 手順 2-2 の anon / publishable キー |
| `CLOUDFLARE_ACCOUNT_ID`  | 手順 3 の Account ID                |

名前は 1 文字でも違うと読み込まれません。コピーして貼り付けてください。

## 5. 公開する

1. 開発ブランチから main へのプルリクエストを作り、マージする（Claude に「プルリクエストを作って」と頼めば作ります）
2. GitHub の **Actions** タブで、main の実行を開く
3. `check` → `integration-e2e` → `deploy` の順に進み、すべて緑のチェックになれば完了（10 分ほど）
4. `deploy` の **Cloudflare Pages に公開** の手順のログに、公開先の URL（例: `https://souschef.pages.dev`）が表示されます
   - `souschef` という名前が既に使われていると、`souschef-xxx.pages.dev` のような URL になります

失敗したときは、赤くなった手順を開いてエラーを確認してください（Claude に貼り付けて相談できます）。

## 6. 公開後の設定

### 6-1. Site URL

Supabase の **Authentication → URL Configuration** で、**Site URL** を手順 5 の公開先 URL にして保存する。

### 6-2. 2 人を許可リストに登録する

Supabase の **SQL Editor → New query** で、メールアドレスと表示名を書き換えて **Run** を押す。

```sql
insert into public.allowed_members (email, display_name)
values
  ('夫のメールアドレス', '夫の表示名'),
  ('妻のメールアドレス', '妻の表示名');
```

- メールアドレスは手順 2-3 で作ったユーザーと同じにしてください
- 表示名は「はなさんが 牛乳 を追加しました」のような通知に使います

## 7. iPhone で使う

1. iPhone の **Safari** で公開先 URL を開く（Chrome などでは「ホーム画面に追加」がアプリとして動きません）
2. 画面下の共有ボタン（四角から矢印が出たアイコン）→ **ホーム画面に追加** → **追加**
3. ホーム画面の SousChef アイコンから開く
4. メールアドレスを入れて **コードを送信** → メールに届いた 6 桁のコードを入れて **ログイン**
5. 夫婦それぞれの iPhone で同じようにする

アプリの更新は自動で届きます（次にアプリを開いたとき）。

### 公開後に確認したいこと

- 電波のない場所（機内モード）でもアプリが開き、在庫が見られるか
- もう一人が食材を追加したとき、通知が出るか
- 献立の提案が 30 秒ほどで返ってくるか

---

## 困ったとき

| 症状                                                                 | 確認すること                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| コードのメールが届かない                                             | 迷惑メールフォルダを確認。Supabase 標準のメール送信は 1 時間あたりの送信数が少なく、続けて試すと届きません。時間をおくか、Authentication → Emails → SMTP Settings で独自のメールサーバを設定する |
| 「コードを送信できませんでした」                                     | 手順 2-3 でそのメールアドレスのユーザーを作ったか                                                                                                                                                |
| ログインできるのに何も保存できない・「このアカウントでは使えません」 | 手順 6-2 の許可リストにメールアドレスが入っているか（大文字小文字は区別しません）                                                                                                                |
| 献立の提案が失敗する                                                 | Supabase の Edge Functions → suggest-meals → Logs。手順 2-5 の API キー、Anthropic の残高と上限                                                                                                  |
| 「今日の提案回数の上限に達しました」                                 | 1 日 20 回まで。日本時間の 0 時にリセットされます                                                                                                                                                |
| `deploy` が「スキップしました」になる                                | 手順 4 の名前の綴り、`production` の Environment に登録したか                                                                                                                                    |
| 鍵が漏れたかもしれない                                               | すぐに各サービスでその鍵を削除（無効化）し、作り直して手順 4 で登録し直す                                                                                                                        |

---

## 付録: 手元から手動で公開する（GitHub に鍵を置かない方法）

GitHub に鍵を置きたくない場合は、手順 4 を飛ばし、パソコンから次を実行して公開できます（Node.js 22 が必要）。この場合 `deploy` はずっと「スキップ」のままになります。

```sh
git clone https://github.com/inz125/SousChef.git && cd SousChef
npm ci
npx supabase login                       # ブラウザでログイン（アクセストークン不要）
npx supabase link --project-ref <Project ID>
npx supabase db push                     # DB のパスワードを聞かれる
npx supabase functions deploy suggest-meals
VITE_SUPABASE_URL=<Project URL> VITE_SUPABASE_ANON_KEY=<anon キー> npm run build
npx wrangler@4.148.0 login               # ブラウザでログイン
npx wrangler@4.148.0 pages deploy dist --project-name souschef --branch main
```

アプリを更新するたびに、このうち `git pull` してから `db push` 以降を実行し直す必要があります。
