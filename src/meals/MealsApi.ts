import type { MealConditions, MealSuggestion } from '../../supabase/functions/_shared/meals.ts'

export type { MealConditions, MealSuggestion }

/** 提案できなかったときの、利用者に見せる理由つきのエラー */
export class MealsError extends Error {}

/** 献立提案 API の境界。本番は Edge Function、テストは FakeMealsApi */
export interface MealsApi {
  suggest(conditions: MealConditions): Promise<MealSuggestion[]>
}
