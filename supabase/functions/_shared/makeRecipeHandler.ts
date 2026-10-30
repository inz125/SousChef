// 案 1 つのレシピを作る API（POST /functions/v1/make-recipe, D-63）の処理本体。
// 提案の回数上限（D-21）は案の段階（suggest-meals）だけで数え、ここでは消費しない
import { z } from 'zod'
import { RefusedError, type RecipeWriter } from './claudeSuggester.ts'
import { CORS, error, json } from './http.ts'
import {
  buildRecipePrompt,
  completeSuggestion,
  MealConditionsSchema,
  MealOutlineSchema,
  safeSuggestions,
  suggestedDishesOf,
  type MealContext,
  type SuggestedDishRecord,
} from './meals.ts'
import { NotAllowedError } from './suggestMealsHandler.ts'

export type MakeRecipeDeps = {
  /** 許可メンバーでなければ NotAllowedError */
  checkAllowed(authorization: string): Promise<void>
  /** ログイン中のユーザーとして在庫・好み・常備調味料を読む（RLS が効く） */
  loadContext(authorization: string): Promise<MealContext>
  /** ログイン中のユーザーを提案した人として、提案された料理の履歴に記録する（D-51） */
  recordSuggested(authorization: string, dishes: SuggestedDishRecord[]): Promise<void>
  writeRecipe: RecipeWriter
}

const BodySchema = z.object({ conditions: MealConditionsSchema, suggestion: MealOutlineSchema })

const FAILED = 'レシピを作れませんでした。もう一度お試しください'

export function createMakeRecipeHandler(deps: MakeRecipeDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return error(405, 'POST で呼び出してください')

    const authorization = req.headers.get('authorization')
    if (!authorization) return error(401, 'ログインしてください')

    const body = BodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return error(400, 'レシピを作る献立が正しくありません')
    const { conditions, suggestion: outline } = body.data

    try {
      await deps.checkAllowed(authorization)
    } catch (e) {
      if (e instanceof NotAllowedError) return error(403, 'このアカウントでは使えません')
      throw e
    }

    const context = await deps.loadContext(authorization)
    const allergies = context.members.flatMap((m) => m.allergies)
    try {
      const reply = await deps.writeRecipe(buildRecipePrompt(context, conditions, outline))
      const completed = completeSuggestion(outline, reply)
      // アレルギー食材が入ったレシピは返さない（モデルの出力を信用しきらないための最終防御）
      const [suggestion] = completed ? safeSuggestions({ suggestions: [completed] }, allergies) : []
      if (!suggestion) return error(502, FAILED)
      // 履歴に残せなくてもレシピは失敗にしない
      await deps
        .recordSuggested(
          authorization,
          suggestedDishesOf([suggestion], conditions.sideMicrowave, context.microwaveDishes),
        )
        .catch((e) => console.error('recording suggested dishes failed', e))
      return json(200, { suggestion })
    } catch (e) {
      if (e instanceof RefusedError) return error(422, FAILED)
      console.error('make-recipe failed', e)
      return error(502, FAILED)
    }
  }
}
