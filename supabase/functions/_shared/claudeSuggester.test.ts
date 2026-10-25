import { createClaudeSuggester, RefusedError } from './claudeSuggester.ts'
import type { MealPlan } from './meals.ts'

const plan: MealPlan = {
  suggestions: [
    {
      main: {
        name: '鶏の照り焼き',
        minutes: 20,
        ingredients: [{ name: '鶏もも肉', amount: '300g', source: 'stock' }],
        steps: ['焼く'],
      },
      side: {
        name: 'キャベツの浅漬け',
        minutes: 10,
        ingredients: [{ name: 'キャベツ', amount: '1/4 個', source: 'stock' }],
        steps: ['揉む'],
      },
      totalMinutes: 25,
      usesExpiringSoon: ['鶏もも肉'],
      tip: '漬けている間に焼く',
    },
  ],
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
  it('Sonnet 5.5 に構造化出力の JSON スキーマ付きで依頼し、結果を検証して返す', async () => {
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
