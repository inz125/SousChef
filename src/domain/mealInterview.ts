import type { IsoDate } from './food'
import { itemsForTab, type InventoryItem } from './inventory'

/** 献立提案のインタビューの質問（D-53）。最後は答えの確認 */
export const INTERVIEW_STEPS = [
  'minutes',
  'shopping',
  'mustUse',
  'soup',
  'side',
  'mood',
  'confirm',
] as const

export type InterviewStep = (typeof INTERVIEW_STEPS)[number]

/** 質問の数（確認は数えない） */
export const QUESTION_COUNT = INTERVIEW_STEPS.length - 1

/** 在庫がないときは「使いたい食材」を飛ばす */
const skipped = (step: InterviewStep, hasStock: boolean) => step === 'mustUse' && !hasStock

function move(step: InterviewStep, hasStock: boolean, by: 1 | -1): InterviewStep | null {
  let index = INTERVIEW_STEPS.indexOf(step) + by
  while (INTERVIEW_STEPS[index] && skipped(INTERVIEW_STEPS[index], hasStock)) index += by
  return INTERVIEW_STEPS[index] ?? null
}

export const nextStep = (step: InterviewStep, hasStock: boolean) => move(step, hasStock, 1)
export const previousStep = (step: InterviewStep, hasStock: boolean) => move(step, hasStock, -1)

/** 何問目か（1 始まり）。飛ばした質問があっても番号は変えない */
export const questionNumber = (step: InterviewStep) => INTERVIEW_STEPS.indexOf(step) + 1

const DAY_MS = 24 * 60 * 60 * 1000
const toUtc = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`)

/** 期限を残り日数で表す（「今日まで」「あと 3 日」「2 日過ぎ」）。期限なしは空 */
export function formatDaysLeft(expiresOn: IsoDate | null, today: IsoDate): string {
  if (expiresOn === null) return ''
  const days = Math.round((toUtc(expiresOn) - toUtc(today)) / DAY_MS)
  if (days === 0) return '今日まで'
  return days > 0 ? `あと ${days} 日` : `${-days} 日過ぎ`
}

export type MustUseCandidate = { name: string; expiresOn: IsoDate | null; estimated: boolean }

/**
 * 「使いたい食材」の候補。在庫一覧「すべて」と同じ並び（D-26）で、
 * 使いたい食材は名前で AI に送るので、同じ名前は期限が近い 1 つにまとめる
 */
export function mustUseCandidates(items: InventoryItem[]): MustUseCandidate[] {
  const seen = new Set<string>()
  return itemsForTab(items, 'all').flatMap((i) => {
    if (seen.has(i.name)) return []
    seen.add(i.name)
    return [{ name: i.name, expiresOn: i.expiresOn, estimated: i.expiresOnEstimated }]
  })
}
