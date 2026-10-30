// 献立提案 API（POST /functions/v1/suggest-meals）の処理本体。DB と AI は差し替え可能にしてテストする。
// 返すのは案（料理名・材料名・合計時間）だけで、レシピは make-recipe で案ごとに作る（D-63）
import { RefusedError, type Suggester } from './claudeSuggester.ts'
import { error, json, CORS } from './http.ts'
import {
  buildMealPrompt,
  fitSide,
  fitSoup,
  MealConditionsSchema,
  safeSuggestions,
  type MealContext,
} from './meals.ts'

export class NotAllowedError extends Error {}
export class QuotaExceededError extends Error {}

export type SuggestMealsDeps = {
  /** ログイン中のユーザーとして 1 回分の利用回数を消費する（D-21） */
  consumeQuota(authorization: string): Promise<void>
  /** ログイン中のユーザーとして在庫・好み・常備調味料を読む（RLS が効く） */
  loadContext(authorization: string): Promise<MealContext>
  suggest: Suggester
}

export function createSuggestMealsHandler(deps: SuggestMealsDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return error(405, 'POST で呼び出してください')

    const authorization = req.headers.get('authorization')
    if (!authorization) return error(401, 'ログインしてください')

    const conditions = MealConditionsSchema.safeParse(await req.json().catch(() => null))
    if (!conditions.success) return error(400, '提案の条件が正しくありません')

    try {
      await deps.consumeQuota(authorization)
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return error(429, '今日の提案回数の上限に達しました。明日また使えます')
      }
      if (e instanceof NotAllowedError) return error(403, 'このアカウントでは使えません')
      throw e
    }

    const context = await deps.loadContext(authorization)
    const allergies = context.members.flatMap((m) => m.allergies)
    try {
      const plan = await deps.suggest(buildMealPrompt(context, conditions.data))
      const suggestions = fitSide(
        fitSoup(safeSuggestions(plan, allergies), conditions.data.soup),
        conditions.data.sideDish,
      )
      if (suggestions.length === 0) {
        return error(502, '安全な献立を作れませんでした。もう一度お試しください')
      }
      return json(200, { suggestions })
    } catch (e) {
      if (e instanceof RefusedError) {
        return error(422, '献立を提案できませんでした。条件を変えてお試しください')
      }
      console.error('suggest-meals failed', e)
      return error(502, '献立の提案に失敗しました。時間をおいてお試しください')
    }
  }
}
