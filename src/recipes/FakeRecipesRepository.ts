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

  async recordCooked(dishNames: string[]) {
    if (this.failRecord) throw new Error('network error')
    this.records = [{ cookedOn: '2026-10-25', dishNames, actorName: 'わたし' }, ...this.records]
  }

  async history() {
    return [...this.records]
  }
}
