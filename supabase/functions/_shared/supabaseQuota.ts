// AI 利用回数の消費（D-21）。呼び出したユーザーの JWT のクライアントで実行する
import type { SupabaseClient } from '@supabase/supabase-js'
import { NotAllowedError, QuotaExceededError } from './suggestMealsHandler.ts'

export async function consumeAiQuota(db: SupabaseClient, kind: string, dailyLimit: number) {
  const { error } = await db.rpc('consume_ai_quota', { kind, daily_limit: dailyLimit })
  if (!error) return
  if (error.message.includes('quota_exceeded')) throw new QuotaExceededError()
  // 未ログイン（anon キーのみ）は関数の実行権限がなく permission denied になる
  if (/not_allowed|permission denied/.test(error.message)) throw new NotAllowedError()
  throw error
}
