import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

// ローカル Supabase（npx supabase start）に対するテスト用ヘルパー。統合テストと E2E で共有する

type LocalEnv = { url: string; anonKey: string; serviceRoleKey: string }
let cached: LocalEnv | undefined

function env(): LocalEnv {
  if (!cached) {
    const status = JSON.parse(
      execSync('npx supabase status -o json', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
    cached = {
      url: status.API_URL,
      anonKey: status.ANON_KEY,
      serviceRoleKey: status.SERVICE_ROLE_KEY,
    }
  }
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
export async function createUser(email: string, { allowed }: { allowed: boolean }) {
  const admin = adminClient()
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  if (allowed) {
    const { error: e } = await admin.from('allowed_members').insert({ email })
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

const MAILPIT_URL = 'http://127.0.0.1:54324'

/** ローカルのメール受信箱（Mailpit）から最新のログインコードを取り出す */
export async function latestLoginCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages.length > 0) {
      const msg = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
      ).json()) as { Text: string }
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`ログインコードのメールが届きませんでした: ${email}`)
}
