import {
  MOCK_MEAL_OUTLINES,
  MOCK_MEAL_PLAN,
  mockRequests,
  setMockScenario,
} from '../support/mockClaude'
import { nodeMakeRecipeHandler } from '../support/makeRecipe'
import { adminClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

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

const outline = MOCK_MEAL_OUTLINES.suggestions[0]

async function invokeWithToken(token: string, body: unknown = { conditions, suggestion: outline }) {
  const res = await nodeMakeRecipeHandler()(
    new Request('http://localhost/functions/v1/make-recipe', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

async function tokenOf(email: string) {
  const { data } = await (await signedInClient(email)).auth.getSession()
  return data.session!.access_token
}

const tokyoToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const mealUsage = async () => {
  const { data } = await adminClient()
    .from('ai_usage')
    .select('count')
    .eq('kind', 'meal')
    .eq('day', tokyoToday())
    .maybeSingle()
  return data?.count ?? 0
}

describe('make-recipe（処理本体 + テスト用 DB + モックの Claude, D-63）', () => {
  afterEach(() => setMockScenario('ok'))

  it('案 1 つのレシピを返し、提案の回数上限は消費しない', async () => {
    const email = uniqueEmail('recipe')
    await createUser(email, { allowed: true })
    const token = await tokenOf(email)
    const before = await mealUsage()

    const { status, body } = await invokeWithToken(token)

    expect(status).toBe(200)
    expect(body.suggestion).toEqual(MOCK_MEAL_PLAN.suggestions[0])
    expect(await mealUsage()).toBe(before)
    const prompt = (await mockRequests()).at(-1)!.messages[0].content
    expect(prompt).toMatch(/主菜: 鶏もも肉の照り焼き（材料: 鶏もも肉、醤油、みりん、しょうが）/)
  })

  it('レシピができた案の料理を、レシピ・レンジの印・提案した人つきで記録し、7 日より古い記録を消す（D-51）', async () => {
    const proposer = uniqueEmail('recipe-proposer')
    const name = `提案した人-${crypto.randomUUID().slice(0, 8)}`
    await createUser(proposer, { allowed: true, displayName: name })
    const old = `古い提案-${crypto.randomUUID().slice(0, 8)}`
    const kept = `6日前の提案-${crypto.randomUUID().slice(0, 8)}`
    const today = tokyoToday()
    const row = (dishName: string, days: number) => ({
      name: dishName,
      dish: { name: dishName, minutes: 5, ingredients: [], steps: ['作る'] },
      microwave: false,
      suggested_on: addDays(today, -days),
      actor_email: proposer,
      actor_name: name,
    })
    const { error } = await adminClient()
      .from('suggested_dishes')
      .insert([row(old, 7), row(kept, 6)])
    expect(error).toBeNull()

    const { status, body } = await invokeWithToken(await tokenOf(proposer))
    expect(status).toBe(200)

    const { data } = await adminClient()
      .from('suggested_dishes')
      .select('name, dish, microwave, suggested_on, actor_name')
      .in('name', ['鶏もも肉の照り焼き', 'キャベツの塩もみ', '豆腐とねぎの味噌汁', old, kept])
    const byName = new Map(data!.map((d) => [d.name, d]))
    expect(byName.get('キャベツの塩もみ')).toEqual({
      name: 'キャベツの塩もみ',
      dish: body.suggestion.side,
      microwave: true,
      suggested_on: today,
      actor_name: name,
    })
    expect(byName.get('鶏もも肉の照り焼き')?.microwave).toBe(false)
    expect(byName.get('豆腐とねぎの味噌汁')?.actor_name).toBe(name)
    expect(byName.has(old)).toBe(false)
    expect(byName.has(kept)).toBe(true)
  })

  it('Claude が失敗したら 502 で、記録しない（D-51）', async () => {
    const proposer = uniqueEmail('recipe-failed')
    const name = `失敗した人-${crypto.randomUUID().slice(0, 8)}`
    await createUser(proposer, { allowed: true, displayName: name })
    await setMockScenario('error')
    const { status, body } = await invokeWithToken(await tokenOf(proposer))
    expect(status).toBe(502)
    expect(body.error).toMatch(/レシピを作れませんでした/)
    const { data } = await adminClient()
      .from('suggested_dishes')
      .select('name')
      .eq('actor_name', name)
    expect(data).toEqual([])
  })

  it('許可リストにないユーザーは 403', async () => {
    const stranger = uniqueEmail('recipe-stranger')
    await createUser(stranger, { allowed: false })
    const { status, body } = await invokeWithToken(await tokenOf(stranger))
    expect(status).toBe(403)
    expect(body.error).toMatch(/このアカウントでは使えません/)
  })

  it('未ログイン（公開用の anon キーだけ）は 403', async () => {
    const { status, body } = await invokeWithToken(env().anonKey)
    expect(status).toBe(403)
    expect(body.error).toMatch(/このアカウントでは使えません/)
  })
})
