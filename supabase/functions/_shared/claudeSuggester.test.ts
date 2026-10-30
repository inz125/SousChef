import { createClaudeRecipeWriter, createClaudeSuggester, RefusedError } from './claudeSuggester.ts'
import type { MealOutlinePlan, RecipeReply } from './meals.ts'

const plan: MealOutlinePlan = {
  suggestions: [
    {
      main: {
        name: '鶏の照り焼き',
        ingredients: [{ name: '鶏もも肉', source: 'stock', category: 'meat' }],
      },
      side: {
        name: 'キャベツの浅漬け',
        ingredients: [{ name: 'キャベツ', source: 'stock', category: 'leafy' }],
      },
      soup: null,
      totalMinutes: 25,
      usesExpiringSoon: ['鶏もも肉'],
    },
  ],
}

const recipe: RecipeReply = {
  main: {
    name: '鶏の照り焼き',
    minutes: 20,
    ingredients: [{ name: '鶏もも肉', amount: '300g', source: 'stock', category: 'meat' }],
    steps: ['焼く'],
  },
  side: null,
  soup: null,
  tip: '',
}

function fakeFetch(
  body: object,
  captured: { url?: string; body?: Record<string, unknown>; headers?: Headers },
) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url)
    captured.body = JSON.parse(String(init?.body))
    captured.headers = new Headers(init?.headers)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
})

describe('createClaudeSuggester', () => {
  it('Sonnet 5.5 に案（分量・手順なし）の JSON スキーマ付きで依頼し、結果を検証して返す（D-63）', async () => {
    const captured: { url?: string; body?: Record<string, unknown>; headers?: Headers } = {}
    const suggest = createClaudeSuggester({
      apiKey: 'test-key',
      fetch: fakeFetch(message(JSON.stringify(plan)), captured),
    })

    const result = await suggest({ system: 'SYS', user: 'USER' })

    expect(result).toEqual(plan)
    expect(captured.url).toMatch(/\/v1\/messages/)
    expect(captured.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
    })
    expect(captured.headers?.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    // 「作った」で余った食材を在庫に追加するため、材料のカテゴリも必須で求める（D-37）
    expect(JSON.stringify(captured.body?.output_config)).toMatch(/"category"/)
    // 案の段階では分量・手順を書かせない（D-63）
    expect(JSON.stringify(captured.body?.output_config)).not.toMatch(/"steps"|"amount"/)
  })

  it('安全上の理由で断られたら RefusedError', async () => {
    const suggest = createClaudeSuggester({
      apiKey: 'test-key',
      fetch: fakeFetch(message('', 'refusal'), {}),
    })
    await expect(suggest({ system: 'S', user: 'U' })).rejects.toBeInstanceOf(RefusedError)
  })

  it('スキーマに合わない応答はエラー', async () => {
    const suggest = createClaudeSuggester({
      apiKey: 'test-key',
      fetch: fakeFetch(message('{"suggestions": "壊れた応答"}'), {}),
    })
    await expect(suggest({ system: 'S', user: 'U' })).rejects.toThrow()
  })
})

describe('createClaudeRecipeWriter（D-63）', () => {
  it('Sonnet 5.5 に案 1 つのレシピ（分量・手順・段取りのコツ）の JSON スキーマ付きで依頼する', async () => {
    const captured: { url?: string; body?: Record<string, unknown>; headers?: Headers } = {}
    const write = createClaudeRecipeWriter({
      apiKey: 'test-key',
      fetch: fakeFetch(message(JSON.stringify(recipe)), captured),
    })

    expect(await write({ system: 'SYS', user: 'USER' })).toEqual(recipe)
    expect(captured.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema' } },
    })
    expect(JSON.stringify(captured.body?.output_config)).toMatch(/"steps".*"tip"|"tip".*"steps"/)
  })

  it('安全上の理由で断られたら RefusedError', async () => {
    const write = createClaudeRecipeWriter({
      apiKey: 'test-key',
      fetch: fakeFetch(message('', 'refusal'), {}),
    })
    await expect(write({ system: 'S', user: 'U' })).rejects.toBeInstanceOf(RefusedError)
  })
})
