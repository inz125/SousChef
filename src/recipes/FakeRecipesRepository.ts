import type { CookingRecord, Dish, RecipesRepository } from './RecipesRepository'

/** テスト用のインメモリ保存先 */
export class FakeRecipesRepository implements RecipesRepository {
  saved: Dish[]
  records: CookingRecord[] = []
  failRecord = false

  constructor(saved: Dish[] = []) {
    this.saved = [...saved]
  }

  async savedDishes() {
    return [...this.saved]
  }

  async saveDish(dish: Dish) {
    this.saved = [dish, ...this.saved.filter((d) => d.name !== dish.name)]
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
}
