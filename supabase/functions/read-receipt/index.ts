// レシート読み取り API（D-42）。本体は _shared/readReceiptHandler.ts（単体テスト済み）
import { createClaudeReceiptReader } from '../_shared/claudeReceiptReader.ts'
import { createReadReceiptHandler } from '../_shared/readReceiptHandler.ts'
import { createSupabaseReceiptDeps } from '../_shared/supabaseReceiptDeps.ts'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} が設定されていません`)
  return value
}

const handler = createReadReceiptHandler({
  ...createSupabaseReceiptDeps(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    // テスト用 Supabase では上限に達しないよう大きな値にする（scripts/test-db.mjs）
    dailyLimit: Number(Deno.env.get('RECEIPT_DAILY_LIMIT')) || undefined,
  }),
  read: createClaudeReceiptReader({
    apiKey: env('ANTHROPIC_API_KEY'),
    // テスト用 Supabase ではモックの Claude サーバを指す（scripts/test-db.mjs）
    baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
  }),
})

Deno.serve(handler)
