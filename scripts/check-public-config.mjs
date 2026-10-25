// 公開前に、画面に埋め込む設定（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）の形を確かめる。
// 間違っていると、アプリは起動直後に止まって真っ白になる（本番の初回公開で実際に起きた）
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... SUPABASE_PROJECT_REF=... node scripts/check-public-config.mjs

/** 問題点を日本語で返す。問題がなければ空配列 */
export function checkPublicConfig({ url, anonKey, projectRef }) {
  const problems = []
  const expectedUrl = `https://${projectRef}.supabase.co`

  for (const [name, value] of [
    ['VITE_SUPABASE_URL', url],
    ['VITE_SUPABASE_ANON_KEY', anonKey],
  ]) {
    if (value !== value.trim() || /\s/.test(value)) {
      problems.push(`${name} に空白や改行が入っています。コピーし直して登録してください`)
    }
  }

  const trimmedUrl = url.trim().replace(/\/$/, '')
  const urlMatch = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(trimmedUrl)
  const path = /^https:\/\/[a-z0-9]+\.supabase\.co(\/.+)$/.exec(trimmedUrl)?.[1]
  if (path) {
    problems.push(
      `VITE_SUPABASE_URL の後ろの ${path}/ は付けず、${expectedUrl} だけを登録してください（付いているとログインできません）`,
    )
  } else if (!urlMatch) {
    problems.push(
      `VITE_SUPABASE_URL が URL の形になっていません。Project URL（${expectedUrl}）を登録してください`,
    )
  } else if (urlMatch[1] !== projectRef) {
    problems.push(
      `VITE_SUPABASE_URL が SUPABASE_PROJECT_REF と一致しません。${expectedUrl} を登録してください`,
    )
  }

  const key = anonKey.trim()
  if (key.startsWith('sb_secret_')) {
    problems.push(
      'VITE_SUPABASE_ANON_KEY に秘密鍵（sb_secret_）が入っています。画面に埋め込むと誰でも読めるので、publishable キーにしてください',
    )
  } else if (!key.startsWith('sb_publishable_') && !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
    problems.push(
      'VITE_SUPABASE_ANON_KEY が publishable キー（sb_publishable_…）または anon キー（eyJ…）になっていません',
    )
  }
  return problems
}

if (import.meta.main) {
  const problems = checkPublicConfig({
    url: process.env.VITE_SUPABASE_URL ?? '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
  })
  for (const p of problems) console.log(`::error title=画面用の設定が正しくありません::${p}`)
  if (problems.length) {
    console.log('docs/deploy.md の手順 2-2 と 4-2 を見直してください')
    process.exit(1)
  }
  console.log('画面用の設定の形は正しいです')
}
