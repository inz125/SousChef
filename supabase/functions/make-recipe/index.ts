// 案 1 つのレシピを作る API（D-63）。本体は _shared/makeRecipeHandler.ts（単体テスト済み）
import { createClaudeRecipeWriter } from '../_shared/claudeSuggester.ts'
import { createMakeRecipeHandler } from '../_shared/makeRecipeHandler.ts'
import { createSupabaseMealDeps } from '../_shared/supabaseMealDeps.ts'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} が設定されていません`)
  return value
}

const handler = createMakeRecipeHandler({
  ...createSupabaseMealDeps(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY')),
  writeRecipe: createClaudeRecipeWriter({
    apiKey: env('ANTHROPIC_API_KEY'),
    // テスト用 Supabase ではモックの Claude サーバを指す（scripts/test-db.mjs）
    baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
  }),
})

Deno.serve(handler)
