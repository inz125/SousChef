// make-recipe の処理本体を Node 上で動かす（本物のテスト用 DB + モックの Claude）。
// Edge Runtime（Deno）での起動は CI の edge スモークテストで確認する
import { createClaudeRecipeWriter } from '../../supabase/functions/_shared/claudeSuggester'
import { createMakeRecipeHandler } from '../../supabase/functions/_shared/makeRecipeHandler'
import { createSupabaseMealDeps } from '../../supabase/functions/_shared/supabaseMealDeps'
import { MOCK_CLAUDE_PORT } from './mockClaude'
import { env } from './supabase'

export function nodeMakeRecipeHandler() {
  const { url, anonKey } = env()
  return createMakeRecipeHandler({
    ...createSupabaseMealDeps(url, anonKey),
    writeRecipe: createClaudeRecipeWriter({
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${MOCK_CLAUDE_PORT}`,
    }),
  })
}
