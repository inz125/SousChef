import { RefusedError } from './claudeSuggester.ts'
import { createReadReceiptHandler, type ReadReceiptDeps } from './readReceiptHandler.ts'
import { NotAllowedError, QuotaExceededError } from './suggestMealsHandler.ts'

const milk = { name: '牛乳', category: 'dairy', location: 'fridge' } as const
const body = { image: 'AAAA', mediaType: 'image/jpeg' }

function setup(over: Partial<ReadReceiptDeps> = {}) {
  const calls = { quota: 0, photos: [] as unknown[], prompts: [] as { system: string }[] }
  const handler = createReadReceiptHandler({
    consumeQuota: async () => void calls.quota++,
    read: async (photo, prompt) => {
      calls.photos.push(photo)
      calls.prompts.push(prompt)
      return { items: [{ ...milk, name: ' 牛乳 ' }, milk] }
    },
    ...over,
  })
  return { handler, calls }
}

const post = (payload: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) =>
  new Request('http://localhost/read-receipt', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

describe('read-receipt の処理本体', () => {
  it('回数を消費して画像を読み取り、整えた食材を返す', async () => {
    const { handler, calls } = setup()
    const res = await handler(post(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [milk] })
    expect(calls.quota).toBe(1)
    expect(calls.photos).toEqual([body])
    expect(calls.prompts[0].system).toMatch(/一般名/)
  })

  it('ログインしていなければ 401', async () => {
    const { handler, calls } = setup()
    expect((await handler(post(body, {}))).status).toBe(401)
    expect(calls.quota).toBe(0)
  })

  it('画像の形式が不正なら 400（回数は消費しない）', async () => {
    const { handler, calls } = setup()
    const res = await handler(post({ image: 'AAAA', mediaType: 'image/gif' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('画像が正しくありません')
    expect(calls.quota).toBe(0)
  })

  it('許可メンバーでなければ 403', async () => {
    const { handler } = setup({
      consumeQuota: async () => {
        throw new NotAllowedError()
      },
    })
    expect((await handler(post(body))).status).toBe(403)
  })

  it('1 日の上限を超えたら 429 と理由を返し、AI は呼ばない', async () => {
    const { handler, calls } = setup({
      consumeQuota: async () => {
        throw new QuotaExceededError()
      },
    })
    const res = await handler(post(body))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe(
      '今日のレシート読み取り回数の上限に達しました。明日また使えます',
    )
    expect(calls.photos).toHaveLength(0)
  })

  it('食材が 1 つも読み取れなければ 422 と撮り直しの案内', async () => {
    const { handler } = setup({ read: async () => ({ items: [] }) })
    const res = await handler(post(body))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe(
      '食材を読み取れませんでした。レシート全体が写るように撮り直してください',
    )
  })

  it('AI に断られたら 422', async () => {
    const { handler } = setup({
      read: async () => {
        throw new RefusedError()
      },
    })
    const res = await handler(post(body))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe(
      'レシートを読み取れませんでした。撮り直してお試しください',
    )
  })

  it('AI の呼び出しに失敗したら 502', async () => {
    const { handler } = setup({
      read: async () => {
        throw new Error('timeout')
      },
    })
    const res = await handler(post(body))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe(
      'レシートの読み取りに失敗しました。時間をおいてお試しください',
    )
  })

  it('ブラウザからの事前確認（OPTIONS）に CORS ヘッダを返す', async () => {
    const { handler } = setup()
    const res = await handler(new Request('http://localhost/read-receipt', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
