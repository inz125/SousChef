// レシート読み取り API（POST /functions/v1/read-receipt）の処理本体。DB と AI は差し替え可能にしてテストする
import { RefusedError } from './claudeSuggester.ts'
import type { ReceiptReader } from './claudeReceiptReader.ts'
import { buildReceiptPrompt, cleanReceiptItems, ReceiptImageSchema } from './receipt.ts'
import { NotAllowedError, QuotaExceededError } from './suggestMealsHandler.ts'

export type ReadReceiptDeps = {
  /** ログイン中のユーザーとして 1 回分の利用回数を消費する（D-21） */
  consumeQuota(authorization: string): Promise<void>
  read: ReceiptReader
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

const error = (status: number, message: string) => json(status, { error: message })

export function createReadReceiptHandler(deps: ReadReceiptDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return error(405, 'POST で呼び出してください')

    const authorization = req.headers.get('authorization')
    if (!authorization) return error(401, 'ログインしてください')

    const photo = ReceiptImageSchema.safeParse(await req.json().catch(() => null))
    if (!photo.success) return error(400, '画像が正しくありません')

    try {
      await deps.consumeQuota(authorization)
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return error(429, '今日のレシート読み取り回数の上限に達しました。明日また使えます')
      }
      if (e instanceof NotAllowedError) return error(403, 'このアカウントでは使えません')
      throw e
    }

    try {
      const items = cleanReceiptItems(await deps.read(photo.data, buildReceiptPrompt()))
      if (items.length === 0) {
        return error(422, '食材を読み取れませんでした。レシート全体が写るように撮り直してください')
      }
      return json(200, { items })
    } catch (e) {
      if (e instanceof RefusedError) {
        return error(422, 'レシートを読み取れませんでした。撮り直してお試しください')
      }
      console.error('read-receipt failed', e)
      return error(502, 'レシートの読み取りに失敗しました。時間をおいてお試しください')
    }
  }
}
