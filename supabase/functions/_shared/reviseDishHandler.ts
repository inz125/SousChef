// 提案された料理 1 品を直す API（POST /functions/v1/revise-dish, D-64）の処理本体。
// 提案の回数上限（D-21）を suggest-meals と同じ枠で 1 回使う（AI を呼ぶ前に数える）
import { z } from 'zod'
import { RefusedError, type DishReviser } from './claudeSuggester.ts'
import { CORS, error, json } from './http.ts'
import {
  buildRevisePrompt,
  COURSES,
  DishSchema,
  safeSuggestions,
  type MealContext,
} from './meals.ts'
import { NotAllowedError, QuotaExceededError } from './suggestMealsHandler.ts'

export type ReviseDishDeps = {
  /** ログイン中のユーザーとして提案の回数を 1 回消費する（D-21） */
  consumeQuota(authorization: string): Promise<void>
  /** ログイン中のユーザーとして在庫・好み・常備調味料を読む（RLS が効く） */
  loadContext(authorization: string): Promise<MealContext>
  reviseDish: DishReviser
}

const BodySchema = z.object({
  course: z.enum(COURSES),
  dish: DishSchema,
  instruction: z.string().trim().min(1).max(200),
  microwave: z.boolean().default(false),
})

const FAILED = '修正できませんでした。もう一度お試しください'

export function createReviseDishHandler(deps: ReviseDishDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return error(405, 'POST で呼び出してください')

    const authorization = req.headers.get('authorization')
    if (!authorization) return error(401, 'ログインしてください')

    const body = BodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return error(400, '修正の内容が正しくありません')
    const revision = body.data

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
      const revised = await deps.reviseDish(buildRevisePrompt(context, revision))
      // アレルギー食材が入った料理は返さない（モデルの出力を信用しきらないための最終防御）
      const [safe] = safeSuggestions(
        { suggestions: [{ main: revised, side: null, soup: null }] },
        allergies,
      )
      if (!safe) return error(502, FAILED)
      return json(200, { dish: safe.main })
    } catch (e) {
      if (e instanceof RefusedError) return error(422, FAILED)
      console.error('revise-dish failed', e)
      return error(502, FAILED)
    }
  }
}
