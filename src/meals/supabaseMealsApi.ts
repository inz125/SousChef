import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import type { Dish } from '../../supabase/functions/_shared/meals.ts'
import { MealsError, type MealOutline, type MealsApi, type MealSuggestion } from './MealsApi'

/** Edge Function suggest-meals・make-recipe・revise-dish を呼ぶ。サーバが返した理由をそのまま利用者に見せる */
export function createSupabaseMealsApi(client: SupabaseClient): MealsApi {
  async function invoke<T>(
    name: string,
    body: Record<string, unknown>,
    failed: string,
  ): Promise<T> {
    const { data, error } = await client.functions.invoke<T>(name, { body })
    if (error instanceof FunctionsHttpError) {
      const reply = await (error.context as Response).json().catch(() => null)
      throw new MealsError(reply?.error ?? failed)
    }
    if (error || !data)
      throw new MealsError('通信できませんでした。電波の良いところでお試しください')
    return data
  }

  return {
    async suggest(conditions) {
      const data = await invoke<{ suggestions: MealOutline[] }>(
        'suggest-meals',
        conditions,
        '献立の提案に失敗しました',
      )
      return data.suggestions
    },
    async makeRecipe(conditions, outline) {
      const data = await invoke<{ suggestion: MealSuggestion }>(
        'make-recipe',
        { conditions, suggestion: outline },
        'レシピを作れませんでした',
      )
      return data.suggestion
    },
    async reviseDish(revision) {
      const data = await invoke<{ dish: Dish }>(
        'revise-dish',
        revision,
        '修正できませんでした。もう一度お試しください',
      )
      return data.dish
    },
  }
}
