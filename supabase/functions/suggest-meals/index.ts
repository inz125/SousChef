// 献立提案 API（D-07, D-33）。本体は _shared/suggestMealsHandler.ts（単体テスト済み）
import { createClaudeSuggester } from '../_shared/claudeSuggester.ts'
import { createSupabaseMealDeps } from '../_shared/supabaseMealDeps.ts'
import { createSuggestMealsHandler } from '../_shared/suggestMealsHandler.ts'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} が設定されていません`)
  return value
}

const handler = createSuggestMealsHandler({
  ...createSupabaseMealDeps(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    // テスト用 Supabase では上限に達しないよう大きな値にする（scripts/test-db.mjs）
    dailyLimit: Number(Deno.env.get('MEAL_DAILY_LIMIT')) || undefined,
  }),
  suggest: createClaudeSuggester({
    apiKey: env('ANTHROPIC_API_KEY'),
    // テスト用 Supabase ではモックの Claude サーバを指す（scripts/test-db.mjs）
    baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
  }),
})

Deno.serve(handler)
