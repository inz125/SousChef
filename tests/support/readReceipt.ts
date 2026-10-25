// read-receipt の処理本体を Node 上で動かす（本物のテスト用 DB + モックの Claude）。
// Edge Runtime（Deno）での起動は CI の edge スモークテストで確認する
import { createClaudeReceiptReader } from '../../supabase/functions/_shared/claudeReceiptReader'
import { createReadReceiptHandler } from '../../supabase/functions/_shared/readReceiptHandler'
import { createSupabaseReceiptDeps } from '../../supabase/functions/_shared/supabaseReceiptDeps'
import { MOCK_CLAUDE_PORT } from './mockClaude'
import { env } from './supabase'

export function nodeReadReceiptHandler(dailyLimit = 1_000_000) {
  const { url, anonKey } = env()
  return createReadReceiptHandler({
    // テストを何度流しても 1 日の上限に達しないようにする
    ...createSupabaseReceiptDeps(url, anonKey, { dailyLimit }),
    read: createClaudeReceiptReader({
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${MOCK_CLAUDE_PORT}`,
    }),
  })
}
