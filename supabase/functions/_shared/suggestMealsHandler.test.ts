import { RefusedError } from './claudeSuggester.ts'
import type { MealContext, MealPlan } from './meals.ts'
import {
  createSuggestMealsHandler,
  NotAllowedError,
  QuotaExceededError,
  type SuggestMealsDeps,
} from './suggestMealsHandler.ts'

const context: MealContext = {
  today: '2026-10-25',
  inventory: [{ name: '鶏もも肉', quantity: 'enough', expiresOn: '2026-10-26' }],
  members: [{ displayName: 'はな', dislikes: [], allergies: ['えび'] }],
  staples: ['醤油'],
}

const suggestion = (mainIngredient: string): MealPlan['suggestions'][number] => ({
  main: {
    name: `${mainIngredient}の料理`,
    minutes: 20,
    ingredients: [{ name: mainIngredient, amount: '200g', source: 'stock', category: 'meat' }],
    steps: ['作る'],
  },
  side: { name: 'サラダ', minutes: 5, ingredients: [], steps: ['和える'] },
  totalMinutes: 20,
  usesExpiringSoon: [],
  tip: '',
})

const conditions = { maxMinutes: 30, allowShopping: false, mood: '', mustUse: [] }

function setup(overrides: Partial<SuggestMealsDeps> = {}) {
  const calls = { prompts: [] as { system: string; user: string }[], quota: 0 }
  const deps: SuggestMealsDeps = {
    consumeQuota: async () => {
      calls.quota++
    },
    loadContext: async () => context,
    suggest: async (prompt) => {
      calls.prompts.push(prompt)
      return { suggestions: [suggestion('鶏もも肉'), suggestion('むきえび'), suggestion('豆腐')] }
    },
    ...overrides,
  }
  return { handler: createSuggestMealsHandler(deps), calls }
}

const post = (body: unknown, headers: Record<string, string> = { Authorization: 'Bearer t' }) =>
  new Request('http://localhost/suggest-meals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('suggest-meals', () => {
  it('条件と在庫から献立を作り、アレルギー食材を含む案を除いて返す', async () => {
    const { handler, calls } = setup()
    const res = await handler(post(conditions))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions.map((s: { main: { name: string } }) => s.main.name)).toEqual([
      '鶏もも肉の料理',
      '豆腐の料理',
    ])
    expect(calls.quota).toBe(1)
    expect(calls.prompts[0].user).toMatch(/鶏もも肉（あと1日）/)
    expect(calls.prompts[0].user).toMatch(/30 分以内/)
  })

  it('ログインしていなければ 401', async () => {
    const { handler, calls } = setup()
    const res = await handler(post(conditions, {}))
    expect(res.status).toBe(401)
    expect(calls.quota).toBe(0)
  })

  it('条件の形式が不正なら 400（回数は消費しない）', async () => {
    const { handler, calls } = setup()
    const res = await handler(post({ ...conditions, maxMinutes: 999 }))
    expect(res.status).toBe(400)
    expect(calls.quota).toBe(0)
  })

  it('許可メンバーでなければ 403', async () => {
    const { handler } = setup({
      consumeQuota: async () => {
        throw new NotAllowedError()
      },
    })
    expect((await handler(post(conditions))).status).toBe(403)
  })

  it('1 日の上限を超えたら 429 と理由を返し、AI は呼ばない', async () => {
    const { handler, calls } = setup({
      consumeQuota: async () => {
        throw new QuotaExceededError()
      },
    })
    const res = await handler(post(conditions))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/今日の提案回数の上限/)
    expect(calls.prompts).toHaveLength(0)
  })

  it('AI に断られたら 422', async () => {
    const { handler } = setup({
      suggest: async () => {
        throw new RefusedError()
      },
    })
    const res = await handler(post(conditions))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/条件を変えて/)
  })

  it('AI の呼び出しに失敗したら 502', async () => {
    const { handler } = setup({
      suggest: async () => {
        throw new Error('timeout')
      },
    })
    expect((await handler(post(conditions))).status).toBe(502)
  })

  it('すべての案にアレルギー食材が含まれていたら 502（安全な案がない）', async () => {
    const { handler } = setup({
      suggest: async () => ({ suggestions: [suggestion('むきえび')] }),
    })
    expect((await handler(post(conditions))).status).toBe(502)
  })

  it('ブラウザからの事前確認（OPTIONS）に CORS ヘッダを返す', async () => {
    const { handler } = setup()
    const res = await handler(new Request('http://localhost/suggest-meals', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toMatch(/authorization/)
  })
})
