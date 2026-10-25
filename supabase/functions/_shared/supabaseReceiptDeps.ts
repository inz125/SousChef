// read-receipt の DB アクセス。呼び出したユーザーの JWT で接続するので、RLS がそのまま効く
import { createClient } from '@supabase/supabase-js'
import type { ReadReceiptDeps } from './readReceiptHandler.ts'
import { consumeAiQuota } from './supabaseQuota.ts'

/** 1 日のレシート読み取り回数の上限（D-21）の初期値 */
export const RECEIPT_DAILY_LIMIT = 10

export function createSupabaseReceiptDeps(
  url: string,
  anonKey: string,
  { dailyLimit = RECEIPT_DAILY_LIMIT }: { dailyLimit?: number } = {},
): Pick<ReadReceiptDeps, 'consumeQuota'> {
  return {
    consumeQuota: (authorization) =>
      consumeAiQuota(
        createClient(url, anonKey, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false },
        }),
        'receipt',
        dailyLimit,
      ),
  }
}
