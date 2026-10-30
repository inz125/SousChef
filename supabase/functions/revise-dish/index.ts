// 提案された料理 1 品を直す API（D-64）。本体は _shared/reviseDishHandler.ts（単体テスト済み）
import { createClaudeDishReviser } from '../_shared/claudeSuggester.ts'
import { createReviseDishHandler } from '../_shared/reviseDishHandler.ts'
import { createSupabaseMealDeps } from '../_shared/supabaseMealDeps.ts'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} が設定されていません`)
  return value
}

const handler = createReviseDishHandler({
  ...createSupabaseMealDeps(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY')),
  reviseDish: createClaudeDishReviser({
    apiKey: env('ANTHROPIC_API_KEY'),
    // テスト用 Supabase ではモックの Claude サーバを指す（scripts/test-db.mjs）
    baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
  }),
})

Deno.serve(handler)
