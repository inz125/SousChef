import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseInventoryRepository } from '../../src/inventory/supabaseInventoryRepository'
import { createSupabaseRecipesRepository } from '../../src/recipes/supabaseRecipesRepository'
import { createSupabaseSettingsRepository } from '../../src/settings/supabaseSettingsRepository'
import { mockRequests, setMockScenario } from '../support/mockClaude'
import { adminClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'
import { nodeSuggestMealsHandler } from '../support/suggestMeals'

const conditions = { maxMinutes: 30, allowShopping: false, soup: true, mood: '和食', mustUse: [] }

async function invokeWithToken(token: string, body: unknown = conditions) {
  const res = await nodeSuggestMealsHandler()(
    new Request('http://localhost/functions/v1/suggest-meals', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

async function invoke(client: SupabaseClient, body: unknown = conditions) {
  const { data } = await client.auth.getSession()
  return invokeWithToken(data.session!.access_token, body)
}

describe('suggest-meals（処理本体 + テスト用 DB + モックの Claude）', () => {
  let email: string
  let client: SupabaseClient

  beforeAll(async () => {
    email = uniqueEmail('meals')
    await createUser(email, { allowed: true, displayName: 'はな' })
    client = await signedInClient(email)
  })

  afterEach(() => setMockScenario('ok'))

  it('ログイン中のユーザーとして在庫・好みを読み、アレルギー食材を含む案を除いて返す', async () => {
    const item = `鶏もも肉-${crypto.randomUUID().slice(0, 8)}`
    await createSupabaseInventoryRepository(client).add({
      name: item,
      category: 'meat',
      location: 'fridge',
      quantity: 'enough',
      expiresOn: null,
      expiresOnEstimated: false,
    })
    await createSupabaseSettingsRepository(client).savePreferences(email, {
      dislikes: [],
      allergies: ['えび'],
    })

    const { status, body } = await invoke(client)

    expect(status).toBe(200)
    const names = body.suggestions.map((s: { main: { name: string } }) => s.main.name)
    expect(names).toContain('鶏もも肉の照り焼き')
    expect(names).not.toContain('えびチリ')

    const sent = (await mockRequests()).at(-1)!
    expect(sent.model).toBe('claude-sonnet-5-5')
    expect(sent.messages[0].content).toContain(item)
    expect(sent.messages[0].content).toMatch(/絶対に使わない.*えび/)
    expect(sent.messages[0].content).toMatch(/常備調味料: .*醤油/)
    expect(sent.messages[0].content).toMatch(/<request>\n和食\n<\/request>/)
  })

  it('直近 7 日間に作った料理と★保存した料理をプロンプトに含める（D-38）', async () => {
    const recent = `最近の料理-${crypto.randomUUID().slice(0, 8)}`
    const old = `昔の料理-${crypto.randomUUID().slice(0, 8)}`
    const favorite = `お気に入り-${crypto.randomUUID().slice(0, 8)}`
    const recipes = createSupabaseRecipesRepository(client)
    await recipes.recordCooked([{ name: recent, minutes: 10, ingredients: [], steps: ['作る'] }])
    await recipes.saveDish({ name: favorite, minutes: 10, ingredients: [], steps: ['作る'] })
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Tokyo',
    })
    const { error } = await adminClient()
      .from('cooking_history')
      .insert({
        cooked_on: eightDaysAgo,
        dish_names: [old],
        actor_email: email,
        actor_name: 'はな',
      })
    expect(error).toBeNull()

    expect((await invoke(client)).status).toBe(200)
    const prompt = (await mockRequests()).at(-1)!.messages[0].content
    expect(prompt).toMatch(new RegExp(`最近作った料理と同じものは避ける: .*${recent}`))
    expect(prompt).not.toContain(old)
    expect(prompt).toMatch(new RegExp(`お気に入りの料理.*${favorite}`))
  })

  it('Claude に断られたら 422', async () => {
    await setMockScenario('refusal')
    const { status, body } = await invoke(client)
    expect(status).toBe(422)
    expect(body.error).toMatch(/条件を変えて/)
  })

  it('Claude が失敗したら 502', async () => {
    await setMockScenario('error')
    expect((await invoke(client)).status).toBe(502)
  })

  it('許可リストにないユーザーは 403（RLS とクォータ関数で拒否）', async () => {
    const stranger = uniqueEmail('meals-stranger')
    await createUser(stranger, { allowed: false })
    expect((await invoke(await signedInClient(stranger))).status).toBe(403)
  })

  it('未ログイン（公開用の anon キーだけ）は 403', async () => {
    // supabase-js は未ログインでも anon キーを Bearer として送るので、ゲートウェイは通過する
    const { status, body } = await invokeWithToken(env().anonKey)
    expect(status).toBe(403)
    expect(body.error).toMatch(/このアカウントでは使えません/)
  })
})
