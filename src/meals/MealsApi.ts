import type {
  Dish,
  DishRevision,
  MealConditions,
  MealOutline,
  MealSuggestion,
} from '../../supabase/functions/_shared/meals.ts'

export type { DishRevision, MealConditions, MealOutline, MealSuggestion }

/** 提案できなかったときの、利用者に見せる理由つきのエラー */
export class MealsError extends Error {}

/** 献立提案 API の境界。本番は Edge Function、テストは FakeMealsApi */
export interface MealsApi {
  /** 3 案の案（料理名・材料名・合計時間）を作る。回数上限を 1 回使う（D-63） */
  suggest(conditions: MealConditions): Promise<MealOutline[]>
  /** 案 1 つにレシピ（分量・手順・段取りのコツ）を付ける。回数上限は使わない（D-63） */
  makeRecipe(conditions: MealConditions, outline: MealOutline): Promise<MealSuggestion>
  /** 料理 1 品を頼み方に合わせて直す。回数上限を 1 回使う（D-64） */
  reviseDish(revision: DishRevision): Promise<Dish>
}

/** レシピつきの案から分量・手順を除いた案 */
export const outlineOf = (s: MealSuggestion): MealOutline => {
  const dish = (d: MealSuggestion['main']) => ({
    name: d.name,
    ingredients: d.ingredients.map(({ name, source, category }) => ({ name, source, category })),
  })
  return {
    main: dish(s.main),
    side: s.side && dish(s.side),
    soup: s.soup && dish(s.soup),
    totalMinutes: s.totalMinutes,
    usesExpiringSoon: s.usesExpiringSoon,
  }
}
