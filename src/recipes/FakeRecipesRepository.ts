import { addDays } from '../domain/expiry'
import {
  SUGGESTED_DAYS,
  type CookingRecord,
  type Dish,
  type RecipesRepository,
  type SavedDish,
  type SuggestedDish,
} from './RecipesRepository'

/** テスト用のインメモリ保存先 */
export class FakeRecipesRepository implements RecipesRepository {
  saved: SavedDish[]
  records: CookingRecord[] = []
  /** 最近提案された料理（新しい順） */
  suggested: SuggestedDish[] = []
  /** suggestedDishes の呼び出し回数 */
  suggestedCalls = 0
  failRecord = false

  constructor(saved: (Dish | SavedDish)[] = []) {
    this.saved = saved.map((d) => ({ microwave: false, ...d }))
  }

  async savedDishes() {
    return [...this.saved]
  }

  async saveDish(dish: Dish, microwave = false) {
    this.saved = [{ ...dish, microwave }, ...this.saved.filter((d) => d.name !== dish.name)]
  }

  async unsaveDish(name: string) {
    this.saved = this.saved.filter((d) => d.name !== name)
  }

  /** 記録する日（日本時間の今日） */
  today = '2026-10-25'
  /** history に渡された期間 */
  historyCalls: [string, string][] = []

  async recordCooked(dishes: Dish[]) {
    if (this.failRecord) throw new Error('network error')
    this.records = [
      { cookedOn: this.today, dishNames: dishes.map((d) => d.name), dishes, actorName: 'わたし' },
      ...this.records,
    ]
  }

  async history(from: string, to: string) {
    this.historyCalls.push([from, to])
    return this.records.filter((r) => from <= r.cookedOn && r.cookedOn <= to)
  }

  async suggestedDishes(today: string) {
    this.suggestedCalls++
    const from = addDays(today, -(SUGGESTED_DAYS - 1))
    return this.suggested.filter((d) => from <= d.suggestedOn)
  }
}
