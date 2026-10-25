import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

// テスト専用のローカル Supabase（npm run test:db:start）に対するヘルパー。統合テストと E2E で共有する

/** テスト用 Supabase の API ポート（開発用は 54321） */
export const TEST_API_URL = 'http://127.0.0.1:54421'

type LocalEnv = { url: string; anonKey: string; serviceRoleKey: string; mailpitUrl: string }

const ENV_KEY = 'TEST_SUPABASE_ENV'

function readStatus(): LocalEnv {
  const status = JSON.parse(
    execSync('node scripts/test-db.mjs status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  )
  // 開発用のデータを消したり汚したりしないよう、テスト用以外には接続しない
  if (status.API_URL !== TEST_API_URL) {
    throw new Error(`テスト用 Supabase ではありません: ${status.API_URL}`)
  }
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    mailpitUrl: status.MAILPIT_URL,
  }
}

/** テスト実行の最初に 1 回だけ接続情報を取得し、環境変数で各ワーカーに渡す（vitest / playwright の globalSetup） */
export function setupTestSupabaseEnv() {
  process.env[ENV_KEY] = JSON.stringify(readStatus())
}

let cached: LocalEnv | undefined

export function env(): LocalEnv {
  const fromSetup = process.env[ENV_KEY]
  cached ??= fromSetup ? (JSON.parse(fromSetup) as LocalEnv) : readStatus()
  return cached
}

export function adminClient(): SupabaseClient {
  return createClient(env().url, env().serviceRoleKey, { auth: { persistSession: false } })
}

export function anonClient(): SupabaseClient {
  return createClient(env().url, env().anonKey, { auth: { persistSession: false } })
}

export function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID()}@example.com`
}

/** ユーザーを事前登録する（サインアップは無効なので管理者が作る） */
export async function createUser(
  email: string,
  { allowed, displayName }: { allowed: boolean; displayName?: string },
) {
  const admin = adminClient()
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  if (allowed) {
    const { error: e } = await admin
      .from('allowed_members')
      .insert({ email, ...(displayName && { display_name: displayName }) })
    if (e) throw e
  }
}

/** OTP でログインしたクライアントを返す */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const client = anonClient()
  const { error: e } = await client.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: 'email',
  })
  if (e) throw e
  return client
}

/** ローカルのメール受信箱（Mailpit）から最新のログインコードを取り出す */
export async function latestLoginCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${env().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages.length > 0) {
      const msg = (await (
        await fetch(`${env().mailpitUrl}/api/v1/message/${messages[0].ID}`)
      ).json()) as { Text: string }
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`ログインコードのメールが届きませんでした: ${email}`)
}
