import type { Dish } from '../../supabase/functions/_shared/meals.ts'

export type { Dish }

/** 調理履歴の 1 件（D-37） */
export type CookingRecord = {
  /** YYYY-MM-DD（日本時間） */
  cookedOn: string
  dishNames: string[]
  actorName: string
}

/** ★保存した料理・調理履歴の保存先の境界。本番は Supabase、テストは FakeRecipesRepository */
export interface RecipesRepository {
  /** 新しく保存した順 */
  savedDishes(): Promise<Dish[]>
  /** 同じ名前の料理は上書きする */
  saveDish(dish: Dish): Promise<void>
  unsaveDish(name: string): Promise<void>
  /** 作った料理を記録する。作った人はサーバ側でログイン中のユーザーにする */
  recordCooked(dishNames: string[]): Promise<void>
  /** 新しい順 */
  history(): Promise<CookingRecord[]>
}
