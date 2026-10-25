import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { MealsError, type MealsApi, type MealSuggestion } from './MealsApi'

/** Edge Function suggest-meals を呼ぶ。サーバが返した理由をそのまま利用者に見せる */
export function createSupabaseMealsApi(client: SupabaseClient): MealsApi {
  return {
    async suggest(conditions) {
      const { data, error } = await client.functions.invoke<{ suggestions: MealSuggestion[] }>(
        'suggest-meals',
        { body: conditions },
      )
      if (error instanceof FunctionsHttpError) {
        const body = await (error.context as Response).json().catch(() => null)
        throw new MealsError(body?.error ?? '献立の提案に失敗しました')
      }
      if (error || !data)
        throw new MealsError('通信できませんでした。電波の良いところでお試しください')
      return data.suggestions
    },
  }
}
