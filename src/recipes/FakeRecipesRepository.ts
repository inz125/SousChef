import type { Dish, RecipesRepository } from './RecipesRepository'

/** テスト用のインメモリ保存先 */
export class FakeRecipesRepository implements RecipesRepository {
  saved: Dish[]

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
}
