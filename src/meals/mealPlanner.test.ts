import { memoryStore } from '../offline/offlineCache'
import { FakeMealsApi } from './FakeMealsApi'
import { loadLastSuggestions } from './lastSuggestions'
import { MealPlanner } from './mealPlanner'
import type { MealConditions } from './MealsApi'

const conditions: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  riceCooked: true,
  noodle: null,
  soup: true,
  sideDish: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('MealPlanner（D-63）', () => {
  it('案を出したらすぐ 3 案のレシピを同時に作り、できたら保存する', async () => {
    const api = new FakeMealsApi()
    api.holdRecipes = true
    const store = memoryStore()
    const planner = new MealPlanner(api, store)
    const changes: unknown[] = []
    planner.subscribe(() => changes.push(planner.getSnapshot()))

    await planner.suggest(conditions)
    expect(planner.getSnapshot()?.plans.map((p) => p.making)).toEqual([true, true, true])
    expect(api.recipeCalls).toHaveLength(3)
    expect(loadLastSuggestions(store)?.plans.map((p) => p.recipe)).toEqual([null, null, null])

    api.releaseRecipes()
    await flush()
    expect(planner.getSnapshot()?.plans.every((p) => p.recipe && !p.making)).toBe(true)
    expect(loadLastSuggestions(store)?.plans.every((p) => p.recipe)).toBe(true)
    expect(changes.length).toBeGreaterThan(1)
  })

  it('画面を離れて購読をやめても、レシピ作りは続き、戻ったときに届いている', async () => {
    const api = new FakeMealsApi()
    api.holdRecipes = true
    const planner = new MealPlanner(api, memoryStore())
    const stop = planner.subscribe(() => {})
    await planner.suggest(conditions)
    stop()

    api.releaseRecipes()
    await flush()
    expect(planner.getSnapshot()?.plans.every((p) => p.recipe)).toBe(true)
  })

  it('案の段階が失敗したら理由つきのエラーにし、前の結果を残す（D-43）', async () => {
    const api = new FakeMealsApi()
    const planner = new MealPlanner(api, memoryStore())
    await planner.suggest(conditions)
    const before = planner.getSnapshot()
    api.error = '今日の提案回数の上限に達しました。明日また使えます'
    await expect(planner.suggest(conditions)).rejects.toThrow(/上限/)
    expect(planner.getSnapshot()).toBe(before)
  })

  it('保存していたレシピのない案は「作っていない」として読み、作り直せる', async () => {
    const store = memoryStore()
    const first = new FakeMealsApi()
    first.holdRecipes = true
    await new MealPlanner(first, store).suggest(conditions)

    const api = new FakeMealsApi()
    const planner = new MealPlanner(api, store)
    expect(planner.getSnapshot()?.plans.map((p) => [p.making, p.failure])).toEqual([
      [false, ''],
      [false, ''],
      [false, ''],
    ])
    expect(api.recipeCalls).toEqual([])

    planner.makeRecipe(1)
    await flush()
    expect(api.recipeCalls.map((c) => [c.conditions, c.outline.main.name])).toEqual([
      [conditions, '豆腐ステーキ'],
    ])
    expect(planner.getSnapshot()?.plans.map((p) => p.recipe !== null)).toEqual([false, true, false])
  })
})
