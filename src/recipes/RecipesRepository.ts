import type { Dish } from '../../supabase/functions/_shared/meals.ts'

export type { Dish }

/** ★保存した料理・調理履歴の保存先の境界。本番は Supabase、テストは FakeRecipesRepository */
export interface RecipesRepository {
  /** 新しく保存した順 */
  savedDishes(): Promise<Dish[]>
  /** 同じ名前の料理は上書きする */
  saveDish(dish: Dish): Promise<void>
  unsaveDish(name: string): Promise<void>
}
