import { RefusedError } from './claudeSuggester.ts'
import { createMakeRecipeHandler, type MakeRecipeDeps } from './makeRecipeHandler.ts'
import type { Dish, MealContext, MealOutline, RecipeReply, SuggestedDishRecord } from './meals.ts'
import { NotAllowedError } from './suggestMealsHandler.ts'

const context: MealContext = {
  today: '2026-10-25',
  inventory: [
    { name: '鶏もも肉', quantity: 'enough', expiresOn: '2026-10-26', frozen: true, thawing: false },
  ],
  members: [{ displayName: 'はな', dislikes: [], allergies: ['えび'] }],
  staples: ['醤油'],
  recentDishes: [],
  savedDishes: [],
  microwaveDishes: [],
}

const outline: MealOutline = {
  main: {
    name: '鶏の照り焼き',
    ingredients: [{ name: '鶏もも肉', source: 'stock', category: 'meat' }],
  },
  side: { name: 'サラダ', ingredients: [] },
  soup: { name: 'みそ汁', ingredients: [] },
  totalMinutes: 25,
  usesExpiringSoon: ['鶏もも肉'],
}

const dish = (name: string, ingredient = '鶏もも肉'): Dish => ({
  name,
  minutes: 10,
  ingredients: [{ name: ingredient, amount: '300g', source: 'stock', category: 'meat' }],
  steps: ['作る'],
})

const reply: RecipeReply = {
  main: dish('鶏の照り焼き'),
  side: dish('サラダ', 'レタス'),
  soup: dish('みそ汁', '味噌'),
  tip: 'サラダを先に作る',
}

const conditions = {
  maxMinutes: 30,
  allowShopping: false,
  riceCooked: true,
  noodle: null,
  soup: true,
  sideDish: true,
  sideMicrowave: true,
  mood: '',
  mustUse: [],
}

function setup(overrides: Partial<MakeRecipeDeps> = {}) {
  const calls = {
    allowed: 0,
    prompts: [] as { system: string; user: string }[],
    recorded: [] as { authorization: string; dishes: SuggestedDishRecord[] }[],
  }
  const deps: MakeRecipeDeps = {
    checkAllowed: async () => {
      calls.allowed++
    },
    loadContext: async () => context,
    recordSuggested: async (authorization, dishes) => {
      calls.recorded.push({ authorization, dishes })
    },
    writeRecipe: async (prompt) => {
      calls.prompts.push(prompt)
      return reply
    },
    ...overrides,
  }
  return { handler: createMakeRecipeHandler(deps), calls }
}

const post = (body: unknown, headers: Record<string, string> = { Authorization: 'Bearer t' }) =>
  new Request('http://localhost/make-recipe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('make-recipe（D-63）', () => {
  it('案 1 つのレシピを作り、案の料理名・合計時間のまま分量・手順・段取りのコツを付けて返す', async () => {
    const { handler, calls } = setup()
    const res = await handler(post({ conditions, suggestion: outline }))
    expect(res.status).toBe(200)
    expect((await res.json()).suggestion).toEqual({
      main: reply.main,
      side: reply.side,
      soup: reply.soup,
      totalMinutes: 25,
      usesExpiringSoon: ['鶏もも肉'],
      tip: 'サラダを先に作る',
    })
    expect(calls.allowed).toBe(1)
    expect(calls.prompts[0].user).toMatch(/主菜: 鶏の照り焼き（材料: 鶏もも肉）/)
    expect(calls.prompts[0].user).toMatch(/鶏もも肉（冷凍/)
  })

  it('レシピができた案の料理を、ログイン中のユーザーとして提案された料理の履歴に記録する（D-51）', async () => {
    const { handler, calls } = setup({
      loadContext: async () => ({ ...context, microwaveDishes: ['鶏の照り焼き'] }),
    })
    expect((await handler(post({ conditions, suggestion: outline }))).status).toBe(200)
    expect(calls.recorded).toHaveLength(1)
    expect(calls.recorded[0].authorization).toBe('Bearer t')
    expect(calls.recorded[0].dishes.map((d) => [d.dish.name, d.dish.steps, d.microwave])).toEqual([
      ['鶏の照り焼き', ['作る'], true],
      ['サラダ', ['作る'], true],
      ['みそ汁', ['作る'], false],
    ])
  })

  it('履歴の記録に失敗してもレシピは返す（D-51）', async () => {
    const { handler } = setup({
      recordSuggested: async () => {
        throw new Error('db down')
      },
    })
    expect((await handler(post({ conditions, suggestion: outline }))).status).toBe(200)
  })

  it('レシピにアレルギー食材が入ったら 502 にして、履歴に記録しない', async () => {
    const { handler, calls } = setup({
      writeRecipe: async () => ({ ...reply, soup: dish('みそ汁', 'むきえび') }),
    })
    const res = await handler(post({ conditions, suggestion: outline }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/レシピを作れませんでした/)
    expect(calls.recorded).toEqual([])
  })

  it('案にある料理のレシピが返ってこなければ 502', async () => {
    const { handler, calls } = setup({ writeRecipe: async () => ({ ...reply, soup: null }) })
    expect((await handler(post({ conditions, suggestion: outline }))).status).toBe(502)
    expect(calls.recorded).toEqual([])
  })

  it('AI に断られたら 422、呼び出しに失敗したら 502（理由つき）', async () => {
    const refused = setup({
      writeRecipe: async () => {
        throw new RefusedError()
      },
    })
    const r1 = await refused.handler(post({ conditions, suggestion: outline }))
    expect(r1.status).toBe(422)
    expect((await r1.json()).error).toMatch(/レシピを作れませんでした/)

    const failed = setup({
      writeRecipe: async () => {
        throw new Error('timeout')
      },
    })
    const r2 = await failed.handler(post({ conditions, suggestion: outline }))
    expect(r2.status).toBe(502)
    expect((await r2.json()).error).toMatch(/レシピを作れませんでした/)
  })

  it('ログインしていなければ 401、形式が不正なら 400、許可メンバーでなければ 403（AI は呼ばない）', async () => {
    const { handler, calls } = setup()
    expect((await handler(post({ conditions, suggestion: outline }, {}))).status).toBe(401)
    expect((await handler(post({ conditions }))).status).toBe(400)

    const notAllowed = setup({
      checkAllowed: async () => {
        throw new NotAllowedError()
      },
    })
    const res = await notAllowed.handler(post({ conditions, suggestion: outline }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/このアカウントでは使えません/)
    expect([...calls.prompts, ...notAllowed.calls.prompts]).toEqual([])
  })

  it('ブラウザからの事前確認（OPTIONS）に CORS ヘッダを返す', async () => {
    const { handler } = setup()
    const res = await handler(new Request('http://localhost/make-recipe', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
