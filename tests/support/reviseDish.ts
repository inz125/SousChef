// revise-dish の処理本体を Node 上で動かす（本物のテスト用 DB + モックの Claude）。
// Edge Runtime（Deno）での起動は CI の edge スモークテストで確認する
import { createClaudeDishReviser } from '../../supabase/functions/_shared/claudeSuggester'
import { createReviseDishHandler } from '../../supabase/functions/_shared/reviseDishHandler'
import { createSupabaseMealDeps } from '../../supabase/functions/_shared/supabaseMealDeps'
import { MOCK_CLAUDE_PORT } from './mockClaude'
import { env } from './supabase'

export function nodeReviseDishHandler() {
  const { url, anonKey } = env()
  return createReviseDishHandler({
    // テストを何度流しても 1 日の上限に達しないようにする
    ...createSupabaseMealDeps(url, anonKey, { dailyLimit: 1_000_000 }),
    reviseDish: createClaudeDishReviser({
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${MOCK_CLAUDE_PORT}`,
    }),
  })
}
