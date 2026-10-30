// Claude API で献立を生成する（D-33）。API キーはサーバ側（Edge Function の環境変数）にだけ置く
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import {
  DishSchema,
  MealOutlinePlanSchema,
  RecipeReplySchema,
  type Dish,
  type MealOutlinePlan,
  type RecipeReply,
} from './meals.ts'

export const MEAL_MODEL = 'claude-sonnet-5-5'

/** 安全上の理由でモデルが回答しなかった */
export class RefusedError extends Error {}

type Prompt = { system: string; user: string }

/** 3 案の案（料理名・材料名・合計時間）を作る（D-63 の 1 段階目） */
export type Suggester = (prompt: Prompt) => Promise<MealOutlinePlan>

/** 案 1 つのレシピ（分量・手順・段取りのコツ）を書く（D-63 の 2 段階目） */
export type RecipeWriter = (prompt: Prompt) => Promise<RecipeReply>

/** 料理 1 品を利用者の頼み方に合わせて直す（D-64） */
export type DishReviser = (prompt: Prompt) => Promise<Dish>

type Options = {
  apiKey: string
  /** テストやモックサーバ用 */
  baseURL?: string
  fetch?: ConstructorParameters<typeof Anthropic>[0] extends infer O
    ? O extends { fetch?: infer F }
      ? F
      : never
    : never
}

/** 構造化出力で依頼し、応答をスキーマで検証して返す関数を作る */
function createStructuredCall<T>(schema: z.ZodType<T>, { apiKey, baseURL, fetch }: Options) {
  const client = new Anthropic({ apiKey, baseURL, fetch, maxRetries: 1 })
  // parse は応答の検証に使い、API には JSON スキーマだけを送る
  const { parse, ...format } = betaZodOutputFormat(schema)

  return async ({ system, user }: Prompt): Promise<T> => {
    const response = await client.beta.messages.create({
      model: MEAL_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      // 献立は中程度の難しさなので、応答の速さを優先して medium
      output_config: { effort: 'medium', format },
      // 安全分類器が誤って断った場合に、サーバ側で別モデルに切り替えて回答させる
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    // 断られたときは本文が空なので、検証より先に終了理由を確認する
    if (response.stop_reason === 'refusal') throw new RefusedError('献立を提案できませんでした')
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return parse(text)
  }
}

export const createClaudeSuggester = (options: Options): Suggester =>
  createStructuredCall(MealOutlinePlanSchema, options)

export const createClaudeRecipeWriter = (options: Options): RecipeWriter =>
  createStructuredCall(RecipeReplySchema, options)

export const createClaudeDishReviser = (options: Options): DishReviser =>
  createStructuredCall(DishSchema, options)
