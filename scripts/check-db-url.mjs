// 公開前に SUPABASE_DB_URL（Supabase の Session pooler の接続文字列）の形を確認する。
// 問題があれば理由を表示して失敗する。パスワードそのものは表示しない。
//
//   SUPABASE_DB_URL=... node scripts/check-db-url.mjs

/** 問題点を日本語で返す。問題がなければ空配列 */
export function checkDbUrl(url) {
  const problems = []
  if (url !== url.trim() || /\s/.test(url)) {
    problems.push('前後や途中に空白や改行が入っています。コピーし直して登録してください')
  }
  const match = /^postgres(?:ql)?:\/\/([^:/]+):(.*)@([^@/]+)\/(.+)$/.exec(url.trim())
  if (!match) {
    problems.push(
      'postgresql://ユーザー:パスワード@ホスト:ポート/postgres の形になっていません。Supabase の Connect → Session pooler の文字列を使ってください',
    )
    return problems
  }
  const [, , password, hostPort] = match
  if (/[[\]]/.test(password)) {
    problems.push(
      'パスワードの部分に角かっこ [ ] が残っています。[YOUR-PASSWORD] は角かっこごとパスワードに置き換えてください',
    )
  }
  if (/[@#/?:]/.test(password) || /%(?![0-9A-Fa-f]{2})/.test(password)) {
    problems.push(
      'パスワードに記号（@ # / ? : %）がそのまま入っています。URL 用に変換するか（例: @ → %40、# → %23）、記号を含まないパスワードに変更してください',
    )
  }
  if (/^db\.[^.]+\.supabase\.co(:\d+)?$/.test(hostPort)) {
    problems.push(
      'Direct connection の文字列です。GitHub Actions からはつながらないので、Session pooler の文字列を使ってください',
    )
  } else if (/:6543$/.test(hostPort)) {
    problems.push(
      'Transaction pooler（ポート 6543）の文字列です。Session pooler（ポート 5432）の文字列を使ってください',
    )
  }
  return problems
}

if (import.meta.main) {
  const problems = checkDbUrl(process.env.SUPABASE_DB_URL ?? '')
  for (const p of problems)
    console.log(`::error title=SUPABASE_DB_URL の形が正しくありません::${p}`)
  if (problems.length) {
    console.log(
      'docs/deploy.md の手順 2-2 を見直し、GitHub の Environment「production」に登録し直してください',
    )
    process.exit(1)
  }
  console.log('SUPABASE_DB_URL の形は正しいです')
}
