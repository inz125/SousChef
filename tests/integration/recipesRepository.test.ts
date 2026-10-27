import type { SupabaseClient } from '@supabase/supabase-js'
import type { Dish } from '../../src/recipes/RecipesRepository'
import { createSupabaseRecipesRepository } from '../../src/recipes/supabaseRecipesRepository'
import {
  adminClient,
  anonClient,
  createUser,
  signedInClient,
  uniqueEmail,
} from '../support/supabase'

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
    expect(found).toEqual([{ ...dish(name, '新しい手順'), microwave: false }])
  })

  it('「レンジで作る料理」かどうかも保存し、保存し直すと上書きする（D-50）', async () => {
    const name = `おひたし-${crypto.randomUUID()}`
    const repo = createSupabaseRecipesRepository(wife)
    await repo.saveDish(dish(name), true)
    const microwaveOf = async () =>
      (await createSupabaseRecipesRepository(husband).savedDishes()).find((d) => d.name === name)
        ?.microwave
    expect(await microwaveOf()).toBe(true)
    await repo.saveDish(dish(name), false)
    expect(await microwaveOf()).toBe(false)
  })

  it('保存したレシピには「レンジで作る料理」の印を混ぜない（D-50）', async () => {
    const name = `煮びたし-${crypto.randomUUID()}`
    const repo = createSupabaseRecipesRepository(wife)
    await repo.saveDish(dish(name), true)
    const savedDish = (await repo.savedDishes()).find((d) => d.name === name)!
    // ★一覧から開いた料理（microwave 付き）を保存し直しても、レシピの JSON は料理だけ
    await repo.saveDish(savedDish, true)
    const { data } = await adminClient().from('saved_dishes').select('recipe').eq('name', name)
    expect(data?.[0].recipe).toEqual(dish(name))
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

const tokyoToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

describe('createSupabaseRecipesRepository 調理履歴（D-37, D-45）', () => {
  it('作った料理をレシピ・作った人の表示名・日本時間の日付つきで新しい順に記録する', async () => {
    const email = uniqueEmail('cook')
    await createUser(email, { allowed: true, displayName: 'はな' })
    const repo = createSupabaseRecipesRepository(await signedInClient(email))
    const first = `照り焼き-${crypto.randomUUID()}`
    const second = `カレー-${crypto.randomUUID()}`
    await repo.recordCooked([dish(first), dish('キャベツの塩もみ', '揉む')])
    await repo.recordCooked([dish(second, '煮る')])

    const today = tokyoToday()
    const history = await repo.history(today, today)
    const mine = history.filter((h) => [first, second].includes(h.dishNames[0]))
    expect(mine).toEqual([
      { cookedOn: today, dishNames: [second], dishes: [dish(second, '煮る')], actorName: 'はな' },
      {
        cookedOn: today,
        dishNames: [first, 'キャベツの塩もみ'],
        dishes: [dish(first), dish('キャベツの塩もみ', '揉む')],
        actorName: 'はな',
      },
    ])
  })

  it('指定した期間の記録だけを返す。レシピを保存する前の記録は dishes が null', async () => {
    const email = uniqueEmail('cook-range')
    await createUser(email, { allowed: true, displayName: 'けん' })
    const repo = createSupabaseRecipesRepository(await signedInClient(email))
    const inRange = `九月の料理-${crypto.randomUUID()}`
    const outOfRange = `十月の料理-${crypto.randomUUID()}`
    const { error } = await adminClient()
      .from('cooking_history')
      .insert([
        { cooked_on: '2020-09-30', dish_names: [inRange], actor_email: email, actor_name: 'けん' },
        {
          cooked_on: '2020-10-01',
          dish_names: [outOfRange],
          actor_email: email,
          actor_name: 'けん',
        },
      ])
    expect(error).toBeNull()

    const september = await repo.history('2020-09-01', '2020-09-30')
    expect(september.find((h) => h.dishNames[0] === inRange)).toEqual({
      cookedOn: '2020-09-30',
      dishNames: [inRange],
      dishes: null,
      actorName: 'けん',
    })
    expect(september.map((h) => h.dishNames[0])).not.toContain(outOfRange)
  })

  it('作った人をなりすまして記録することはできない', async () => {
    const email = uniqueEmail('cook-a')
    await createUser(email, { allowed: true, displayName: 'はな' })
    const client = await signedInClient(email)
    const name = `なりすまし-${crypto.randomUUID()}`
    await client
      .from('cooking_history')
      .insert({ dish_names: [name], actor_email: 'other@example.com', actor_name: 'けん' })
    const today = tokyoToday()
    const found = (await createSupabaseRecipesRepository(client).history(today, today)).find(
      (h) => h.dishNames[0] === name,
    )
    expect(found?.actorName).toBe('はな')
  })

  it('許可リストにないユーザーは履歴を見られず、記録もできない', async () => {
    const email = uniqueEmail('cook-stranger')
    await createUser(email, { allowed: false })
    const stranger = createSupabaseRecipesRepository(await signedInClient(email))
    const today = tokyoToday()
    expect(await stranger.history(today, today)).toEqual([])
    await expect(stranger.recordCooked([dish('いたずら')])).rejects.toThrow(/row-level security/i)
  })
})
