// 表示中の提案と、案ごとのレシピ作り（D-63）。画面（タブ）を離れてもレシピ作りを続けられるよう、
// React の外に置いてアプリ全体で 1 つ持つ。最後の提案は端末に保存する（D-43）
import type { KeyValueStore } from '../offline/offlineCache'
import { loadLastSuggestions, saveLastSuggestions, type Plan } from './lastSuggestions'
import { MealsError, type MealConditions, type MealsApi } from './MealsApi'

/** 表示中の案 */
export type ShownPlan = Plan & {
  /** レシピを作っている途中か */
  making: boolean
  /** レシピを作れなかった理由。途中でアプリを閉じてレシピがない案は空文字 */
  failure: string | null
}

export type PlannerState = { conditions: MealConditions; plans: ShownPlan[] } | null

const RECIPE_FAILED = 'レシピを作れませんでした'

export class MealPlanner {
  private state: PlannerState
  private listeners = new Set<() => void>()
  /** 何回目の提案か。前の提案のレシピが後から届いても使わない */
  private round = 0
  private api: MealsApi
  private store: KeyValueStore

  constructor(api: MealsApi, store: KeyValueStore) {
    this.api = api
    this.store = store
    const last = loadLastSuggestions(store)
    // 途中でアプリを閉じてレシピのない案は、自動では作り直さず「レシピを作る」を出す
    this.state = last && {
      conditions: last.conditions,
      plans: last.plans.map((p) => ({ ...p, making: false, failure: p.recipe ? null : '' })),
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  /** 案を作ってもらい、すぐ 3 案のレシピを同時に作り始める。失敗したら MealsError で、前の結果は残す */
  async suggest(conditions: MealConditions) {
    const outlines = await this.api.suggest(conditions)
    this.round++
    this.set({
      conditions,
      plans: outlines.map((outline) => ({ outline, recipe: null, making: true, failure: null })),
    })
    outlines.forEach((_, i) => this.makeRecipe(i))
  }

  /** index 番目の案のレシピを作る（作り直す） */
  makeRecipe(index: number) {
    const state = this.state
    const plan = state?.plans[index]
    if (!state || !plan) return
    const mine = this.round
    this.update(index, { making: true, failure: null })
    this.api.makeRecipe(state.conditions, plan.outline).then(
      (recipe) => {
        if (this.round === mine) this.update(index, { recipe, making: false })
      },
      (err) => {
        if (this.round === mine)
          this.update(index, {
            making: false,
            failure: err instanceof MealsError ? err.message : RECIPE_FAILED,
          })
      },
    )
  }

  private update(index: number, change: Partial<ShownPlan>) {
    if (!this.state) return
    this.set({
      ...this.state,
      plans: this.state.plans.map((p, i) => (i === index ? { ...p, ...change } : p)),
    })
  }

  private set(state: NonNullable<PlannerState>) {
    this.state = state
    saveLastSuggestions(this.store, {
      conditions: state.conditions,
      plans: state.plans.map(({ outline, recipe }) => ({ outline, recipe })),
    })
    for (const listener of this.listeners) listener()
  }
}
