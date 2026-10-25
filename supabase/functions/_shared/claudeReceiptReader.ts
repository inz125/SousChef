// Claude API でレシートの写真から食材を読み取る（D-42）。API キーはサーバ側にだけ置く
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { RefusedError } from './claudeSuggester.ts'
import { ReceiptItemsSchema, type ReceiptImage, type ReceiptItems } from './receipt.ts'

export const RECEIPT_MODEL = 'claude-sonnet-5-5'

export type ReceiptReader = (
  photo: ReceiptImage,
  prompt: { system: string; user: string },
) => Promise<ReceiptItems>

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
const { parse, ...format } = betaZodOutputFormat(ReceiptItemsSchema)

export function createClaudeReceiptReader({ apiKey, baseURL, fetch }: Options): ReceiptReader {
  const client = new Anthropic({ apiKey, baseURL, fetch, maxRetries: 1 })

  return async (photo, { system, user }) => {
    const response = await client.beta.messages.create({
      model: RECEIPT_MODEL,
      max_tokens: 8000,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: photo.mediaType, data: photo.image },
            },
            { type: 'text', text: user },
          ],
        },
      ],
      output_config: { effort: 'medium', format },
      // 安全分類器が誤って断った場合に、サーバ側で別モデルに切り替えて回答させる
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    // 断られたときは本文が空なので、検証より先に終了理由を確認する
    if (response.stop_reason === 'refusal') throw new RefusedError('レシートを読み取れませんでした')
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return parse(text)
  }
}
