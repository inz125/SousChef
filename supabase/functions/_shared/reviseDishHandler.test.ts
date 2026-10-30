import { RefusedError } from './claudeSuggester.ts'
import type { Dish, MealContext } from './meals.ts'
import { createReviseDishHandler, type ReviseDishDeps } from './reviseDishHandler.ts'
import { NotAllowedError, QuotaExceededError } from './suggestMealsHandler.ts'

const context: MealContext = {
  today: '2026-10-25',
  inventory: [
    { name: 'じゃがいも', quantity: 'enough', expiresOn: null, frozen: false, thawing: false },
  ],
  members: [{ displayName: 'はな', dislikes: [], allergies: ['えび'] }],
  staples: ['醤油'],
  recentDishes: [],
  savedDishes: [],
  microwaveDishes: [],
}

const dish = (amount: string, ingredient = 'じゃがいも'): Dish => ({
  name: '肉じゃが',
  minutes: 25,
  ingredients: [{ name: ingredient, amount, source: 'stock', category: 'root' }],
  steps: ['煮る'],
})

const body = {
  course: 'main',
  dish: dish('2 個'),
  instruction: 'じゃがいもを1個にして',
  microwave: false,
}

function setup(overrides: Partial<ReviseDishDeps> = {}) {
  const calls = { quota: [] as string[], prompts: [] as { system: string; user: string }[] }
  const deps: ReviseDishDeps = {
    consumeQuota: async (authorization) => {
      calls.quota.push(authorization)
    },
    loadContext: async () => context,
    reviseDish: async (prompt) => {
      calls.prompts.push(prompt)
      return dish('1 個')
    },
    ...overrides,
  }
  return { handler: createReviseDishHandler(deps), calls }
}

const post = (b: unknown, headers: Record<string, string> = { Authorization: 'Bearer t' }) =>
  new Request('http://localhost/revise-dish', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(b),
  })

describe('revise-dish（D-64）', () => {
  it('頼み方に合わせて直した料理を返し、提案の回数を 1 回使う', async () => {
    const { handler, calls } = setup()
    const res = await handler(post(body))
    expect(res.status).toBe(200)
    expect((await res.json()).dish).toEqual(dish('1 個'))
    expect(calls.quota).toEqual(['Bearer t'])
    expect(calls.prompts[0].user).toMatch(/じゃがいも 2 個/)
    expect(calls.prompts[0].user).toMatch(/<request>\nじゃがいもを1個にして\n<\/request>/)
  })

  it('回数上限に達していたら 429 で、AI は呼ばない（D-21）', async () => {
    const { handler, calls } = setup({
      consumeQuota: async () => {
        throw new QuotaExceededError()
      },
    })
    const res = await handler(post(body))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('今日の提案回数の上限に達しました。明日また使えます')
    expect(calls.prompts).toHaveLength(0)
  })

  it('許可メンバーでなければ 403', async () => {
    const { handler } = setup({
      consumeQuota: async () => {
        throw new NotAllowedError()
      },
    })
    expect((await handler(post(body))).status).toBe(403)
  })

  it('未ログインは 401', async () => {
    const { handler } = setup()
    expect((await handler(post(body, {}))).status).toBe(401)
  })

  it.each([
    ['空の頼み方', { ...body, instruction: '  ' }],
    ['201 文字の頼み方', { ...body, instruction: 'あ'.repeat(201) }],
    ['不明な区分', { ...body, course: 'dessert' }],
    ['料理がない', { ...body, dish: undefined }],
  ])('%sは 400 で、回数を使わない', async (_, b) => {
    const { handler, calls } = setup()
    const res = await handler(post(b))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('修正の内容が正しくありません')
    expect(calls.quota).toHaveLength(0)
  })

  it('アレルギー食材が入った修正結果は返さない（サーバ側の最終防御）', async () => {
    const { handler } = setup({ reviseDish: async () => dish('100g', 'むきえび') })
    const res = await handler(post(body))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('修正できませんでした。もう一度お試しください')
  })

  it('AI が断ったら 422、失敗したら 502', async () => {
    const refused = setup({
      reviseDish: async () => {
        throw new RefusedError('x')
      },
    })
    const r1 = await refused.handler(post(body))
    expect(r1.status).toBe(422)
    expect((await r1.json()).error).toBe('修正できませんでした。もう一度お試しください')
    const failed = setup({
      reviseDish: async () => {
        throw new Error('api down')
      },
    })
    const r2 = await failed.handler(post(body))
    expect(r2.status).toBe(502)
    expect((await r2.json()).error).toBe('修正できませんでした。もう一度お試しください')
  })
})
