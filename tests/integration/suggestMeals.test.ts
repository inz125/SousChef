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

const tokyoToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

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
      thawedOn: null,
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

  it('★保存した「レンジで作る料理」だけを、レンジで作る料理としてプロンプトに含める（D-50）', async () => {
    const microwave = `レンジ料理-${crypto.randomUUID().slice(0, 8)}`
    const normal = `普通の料理-${crypto.randomUUID().slice(0, 8)}`
    const recipes = createSupabaseRecipesRepository(client)
    await recipes.saveDish({ name: microwave, minutes: 5, ingredients: [], steps: ['チン'] }, true)
    await recipes.saveDish({ name: normal, minutes: 5, ingredients: [], steps: ['焼く'] }, false)

    expect((await invoke(client, { ...conditions, sideMicrowave: true })).status).toBe(200)
    const prompt = (await mockRequests()).at(-1)!.messages[0].content
    expect(prompt).toMatch(/副菜の加熱は電子レンジだけ/)
    expect(prompt).toMatch(new RegExp(`電子レンジで作る（加熱は電子レンジだけ）: .*${microwave}`))
    expect(prompt).not.toMatch(new RegExp(`電子レンジで作る（加熱は電子レンジだけ）: .*${normal}`))
  })

  it('提案した料理をレシピ・レンジの印・提案した人つきで記録し、7 日より古い記録を消す（D-51）', async () => {
    const proposer = uniqueEmail('meals-proposer')
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

    const { status, body } = await invoke(await signedInClient(proposer), {
      ...conditions,
      sideMicrowave: true,
    })
    expect(status).toBe(200)

    const { data } = await adminClient()
      .from('suggested_dishes')
      .select('name, dish, microwave, suggested_on, actor_name')
      .in('name', ['鶏もも肉の照り焼き', 'キャベツの塩もみ', '豆腐とねぎの味噌汁', old, kept])
    const byName = new Map(data!.map((d) => [d.name, d]))
    expect(byName.get('キャベツの塩もみ')).toEqual({
      name: 'キャベツの塩もみ',
      dish: body.suggestions[0].side,
      microwave: true,
      suggested_on: today,
      actor_name: name,
    })
    expect(byName.get('鶏もも肉の照り焼き')?.microwave).toBe(false)
    expect(byName.get('豆腐とねぎの味噌汁')?.actor_name).toBe(name)
    expect(byName.has(old)).toBe(false)
    expect(byName.has(kept)).toBe(true)
  })

  it('提案に失敗したら記録しない（D-51）', async () => {
    const proposer = uniqueEmail('meals-failed')
    const name = `失敗した人-${crypto.randomUUID().slice(0, 8)}`
    await createUser(proposer, { allowed: true, displayName: name })
    await setMockScenario('error')
    expect((await invoke(await signedInClient(proposer))).status).toBe(502)
    const { data } = await adminClient()
      .from('suggested_dishes')
      .select('name')
      .eq('actor_name', name)
    expect(data).toEqual([])
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
