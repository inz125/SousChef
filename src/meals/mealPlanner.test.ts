import { memoryStore } from '../offline/offlineCache'
import { FakeMealsApi, SAMPLE_SUGGESTIONS } from './FakeMealsApi'
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

describe('MealPlanner の料理の修正（D-64）', () => {
  const [first] = SAMPLE_SUGGESTIONS
  const half = { ...first.main, name: '鶏の照り焼き（半分）' }

  async function ready() {
    const api = new FakeMealsApi()
    const store = memoryStore()
    const planner = new MealPlanner(api, store)
    await planner.suggest(conditions)
    await flush()
    return { api, store, planner }
  }

  it('料理を頼み方どおりに直して置き換え、ほかの料理・段取りはそのまま。端末に保存する', async () => {
    const { api, store, planner } = await ready()
    api.revised = half
    api.holdRevisions = true
    const done = planner.revise(0, 'main', '鶏肉を半分に', false)
    expect(planner.getSnapshot()?.plans[0].revising).toEqual(['main'])
    api.releaseRevisions()
    await done

    expect(api.reviseCalls).toEqual([
      { course: 'main', dish: first.main, instruction: '鶏肉を半分に', microwave: false },
    ])
    const plan = planner.getSnapshot()!.plans[0]
    expect(plan.revising).toEqual([])
    expect(plan.recipe).toEqual({ ...first, main: half })
    expect(plan.revisions).toEqual({ main: { original: first.main, microwave: false } })
    expect(loadLastSuggestions(store)?.plans[0].recipe?.main).toEqual(half)
  })

  it('続けて直すと修正後のレシピをもとに直し、元に戻すと最初のレシピに戻る', async () => {
    const { api, planner } = await ready()
    api.revised = half
    await planner.revise(0, 'side', 'a', true)
    await planner.revise(0, 'side', 'b', true)
    expect(api.reviseCalls[1].dish).toEqual(half)
    expect(planner.getSnapshot()!.plans[0].revisions?.side?.original).toEqual(first.side)

    planner.undo(0, 'side')
    const plan = planner.getSnapshot()!.plans[0]
    expect(plan.recipe).toEqual(first)
    expect(plan.revisions?.side).toBeUndefined()
  })

  it('失敗したら理由つきのエラーにし、レシピは修正前のまま', async () => {
    const { api, planner } = await ready()
    api.reviseError = '今日の提案回数の上限に達しました。明日また使えます'
    await expect(planner.revise(0, 'main', 'a', false)).rejects.toThrow(/上限/)
    const plan = planner.getSnapshot()!.plans[0]
    expect(plan.recipe).toEqual(first)
    expect(plan.revising).toEqual([])
    expect(plan.revisions).toBeUndefined()
  })

  it('直している間に別の案を出したら、届いた修正は捨てる', async () => {
    const { api, planner } = await ready()
    api.revised = half
    api.holdRevisions = true
    const done = planner.revise(0, 'main', 'a', false)
    await planner.suggest(conditions)
    await flush()
    api.releaseRevisions()
    await done
    expect(planner.getSnapshot()!.plans[0].recipe).toEqual(first)
    expect(planner.getSnapshot()!.plans[0].revisions).toBeUndefined()
  })
})
