import { RefusedError } from './claudeSuggester.ts'
import { createClaudeReceiptReader } from './claudeReceiptReader.ts'

const result = { items: [{ name: '牛乳', category: 'dairy', location: 'fridge' }] }

type Captured = { url?: string; body?: Record<string, unknown>; headers?: Headers }

function fakeFetch(body: object, captured: Captured) {
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

const photo = { image: 'AAAA', mediaType: 'image/jpeg' as const }

describe('createClaudeReceiptReader', () => {
  it('Sonnet 5.5 に画像と構造化出力のスキーマ付きで依頼し、検証した結果を返す', async () => {
    const captured: Captured = {}
    const read = createClaudeReceiptReader({
      apiKey: 'test-key',
      fetch: fakeFetch(message(JSON.stringify(result)), captured),
    })

    expect(await read(photo, { system: 'SYS', user: 'USER' })).toEqual(result)

    expect(captured.url).toMatch(/\/v1\/messages/)
    expect(captured.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'SYS',
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
            { type: 'text', text: 'USER' },
          ],
        },
      ],
    })
  })

  it('安全上の理由で断られたら RefusedError', async () => {
    const read = createClaudeReceiptReader({
      apiKey: 'test-key',
      fetch: fakeFetch(message('', 'refusal'), {}),
    })
    await expect(read(photo, { system: 'S', user: 'U' })).rejects.toBeInstanceOf(RefusedError)
  })

  it('スキーマに合わない応答はエラー', async () => {
    const read = createClaudeReceiptReader({
      apiKey: 'test-key',
      fetch: fakeFetch(message('{"items": [{"name": "牛乳"}]}'), {}),
    })
    await expect(read(photo, { system: 'S', user: 'U' })).rejects.toThrow()
  })
})
