// Claude API で献立を生成する（D-33）。API キーはサーバ側（Edge Function の環境変数）にだけ置く
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { MealPlanSchema, type MealPlan } from './meals.ts'

export const MEAL_MODEL = 'claude-sonnet-5-5'

/** 安全上の理由でモデルが回答しなかった */
export class RefusedError extends Error {}

export type Suggester = (prompt: { system: string; user: string }) => Promise<MealPlan>

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

// parse は応答の検証に使い、API には JSON スキーマだけを送る
const { parse, ...format } = betaZodOutputFormat(MealPlanSchema)

export function createClaudeSuggester({ apiKey, baseURL, fetch }: Options): Suggester {
  const client = new Anthropic({ apiKey, baseURL, fetch, maxRetries: 1 })

  return async ({ system, user }) => {
    const response = await client.beta.messages.create({
      model: MEAL_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      // 献立 3 案は中程度の難しさなので、応答の速さを優先して medium
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
