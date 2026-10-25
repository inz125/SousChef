import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

// テスト専用のローカル Supabase（npm run test:db:start）に対するヘルパー。統合テストと E2E で共有する

/** テスト用 Supabase の API ポート（開発用は 54321） */
export const TEST_API_URL = 'http://127.0.0.1:54421'

type LocalEnv = { url: string; anonKey: string; serviceRoleKey: string }

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
/** テストユーザーの共通パスワード（テスト用 DB だけで使う） */
export const TEST_PASSWORD = 'test-password-1234'

export async function createUser(
  email: string,
  { allowed, displayName }: { allowed: boolean; displayName?: string },
) {
  const admin = adminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  if (allowed) {
    const { error: e } = await admin
      .from('allowed_members')
      .insert({ email, ...(displayName && { display_name: displayName }) })
    if (e) throw e
  }
}

/** OTP でログインしたクライアントを返す */
/** パスワードでログインしたクライアントを返す */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw error
  return client
}
