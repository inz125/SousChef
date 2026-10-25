import type { SupabaseClient } from '@supabase/supabase-js'
import type { Dish } from '../../src/recipes/RecipesRepository'
import { createSupabaseRecipesRepository } from '../../src/recipes/supabaseRecipesRepository'
import { anonClient, createUser, signedInClient, uniqueEmail } from '../support/supabase'

const dish = (name: string, step = '焼く'): Dish => ({
  name,
  minutes: 20,
  ingredients: [{ name: '鶏もも肉', amount: '300g', source: 'stock', category: 'meat' }],
  steps: [step],
})

describe('createSupabaseRecipesRepository ★保存（D-36）', () => {
  let wife: SupabaseClient
  let husband: SupabaseClient

  beforeAll(async () => {
    const w = uniqueEmail('wife')
    const h = uniqueEmail('husband')
    await createUser(w, { allowed: true })
    await createUser(h, { allowed: true })
    wife = await signedInClient(w)
    husband = await signedInClient(h)
  })

  it('保存した料理は、もう一人からも新しい順に見える', async () => {
    const first = `照り焼き-${crypto.randomUUID()}`
    const second = `塩もみ-${crypto.randomUUID()}`
    await createSupabaseRecipesRepository(wife).saveDish(dish(first))
    await createSupabaseRecipesRepository(wife).saveDish(dish(second))

    const names = (await createSupabaseRecipesRepository(husband).savedDishes()).map((d) => d.name)
    expect(names.indexOf(second)).toBeLessThan(names.indexOf(first))
    expect(names).toContain(first)
  })

  it('同じ名前で保存し直すとレシピを最新にし、1 つのまま', async () => {
    const name = `生姜焼き-${crypto.randomUUID()}`
    const repo = createSupabaseRecipesRepository(wife)
    await repo.saveDish(dish(name, '古い手順'))
    await repo.saveDish(dish(name, '新しい手順'))
    const found = (await repo.savedDishes()).filter((d) => d.name === name)
    expect(found).toEqual([dish(name, '新しい手順')])
  })

  it('保存をやめられる', async () => {
    const name = `煮物-${crypto.randomUUID()}`
    const repo = createSupabaseRecipesRepository(wife)
    await repo.saveDish(dish(name))
    await repo.unsaveDish(name)
    expect((await repo.savedDishes()).map((d) => d.name)).not.toContain(name)
  })

  it('許可リストにないユーザー・未ログインは見られず、保存もできない', async () => {
    const name = `秘密の料理-${crypto.randomUUID()}`
    await createSupabaseRecipesRepository(wife).saveDish(dish(name))
    const email = uniqueEmail('stranger')
    await createUser(email, { allowed: false })
    const stranger = createSupabaseRecipesRepository(await signedInClient(email))
    expect((await stranger.savedDishes()).map((d) => d.name)).not.toContain(name)
    await expect(stranger.saveDish(dish('いたずら'))).rejects.toThrow(/row-level security/i)
    expect(
      (await createSupabaseRecipesRepository(anonClient()).savedDishes()).map((d) => d.name),
    ).not.toContain(name)
  })
})

describe('createSupabaseRecipesRepository 調理履歴（D-37）', () => {
  it('作った料理を、作った人の表示名と日本時間の日付つきで新しい順に記録する', async () => {
    const email = uniqueEmail('cook')
    await createUser(email, { allowed: true, displayName: 'はな' })
    const repo = createSupabaseRecipesRepository(await signedInClient(email))
    const first = `照り焼き-${crypto.randomUUID()}`
    const second = `カレー-${crypto.randomUUID()}`
    await repo.recordCooked([first, 'キャベツの塩もみ'])
    await repo.recordCooked([second])

    const history = await repo.history()
    const tokyoToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(
      new Date(),
    )
    const mine = history.filter((h) => [first, second].includes(h.dishNames[0]))
    expect(mine).toEqual([
      { cookedOn: tokyoToday, dishNames: [second], actorName: 'はな' },
      { cookedOn: tokyoToday, dishNames: [first, 'キャベツの塩もみ'], actorName: 'はな' },
    ])
  })

  it('作った人をなりすまして記録することはできない', async () => {
    const email = uniqueEmail('cook-a')
    await createUser(email, { allowed: true, displayName: 'はな' })
    const client = await signedInClient(email)
    const name = `なりすまし-${crypto.randomUUID()}`
    await client
      .from('cooking_history')
      .insert({ dish_names: [name], actor_email: 'other@example.com', actor_name: 'けん' })
    const found = (await createSupabaseRecipesRepository(client).history()).find(
      (h) => h.dishNames[0] === name,
    )
    expect(found?.actorName).toBe('はな')
  })

  it('許可リストにないユーザーは履歴を見られず、記録もできない', async () => {
    const email = uniqueEmail('cook-stranger')
    await createUser(email, { allowed: false })
    const stranger = createSupabaseRecipesRepository(await signedInClient(email))
    expect(await stranger.history()).toEqual([])
    await expect(stranger.recordCooked(['いたずら'])).rejects.toThrow(/row-level security/i)
  })
})
