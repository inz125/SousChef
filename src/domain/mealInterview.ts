import {
  NOODLES,
  type MealConditions,
  type Noodle,
} from '../../supabase/functions/_shared/meals.ts'
import type { IsoDate } from './food'
import { itemsForTab, type InventoryItem } from './inventory'

/** 献立提案のインタビューの質問（D-53・D-54）。最後は答えの確認 */
export const INTERVIEW_STEPS = [
  'minutes',
  'shopping',
  'rice',
  'noodle',
  'mustUse',
  'soup',
  'sideDish',
  'side',
  'mood',
  'confirm',
] as const

export type InterviewStep = (typeof INTERVIEW_STEPS)[number]

/** 質問の数（確認は数えない） */
export const QUESTION_COUNT = INTERVIEW_STEPS.length - 1

/** どの質問を飛ばすかを決めるもの。answers は今の答え */
export type InterviewFlow = {
  hasStock: boolean
  answers: Pick<MealConditions, 'riceCooked' | 'noodle' | 'sideDish'>
}

/**
 * 在庫がないときは「使いたい食材」、ご飯が炊いてあるときは「麺」を飛ばす。
 * 「副菜の有無」は麺を選んだときだけ聞き、副菜なしなら「副菜のレンジ」を飛ばす
 */
function skipped(step: InterviewStep, { hasStock, answers: a }: InterviewFlow) {
  if (step === 'mustUse') return !hasStock
  if (step === 'noodle') return a.riceCooked
  if (step === 'sideDish') return a.noodle === null
  if (step === 'side') return !a.sideDish
  return false
}

function move(step: InterviewStep, flow: InterviewFlow, by: 1 | -1): InterviewStep | null {
  let index = INTERVIEW_STEPS.indexOf(step) + by
  while (INTERVIEW_STEPS[index] && skipped(INTERVIEW_STEPS[index], flow)) index += by
  return INTERVIEW_STEPS[index] ?? null
}

export const nextStep = (step: InterviewStep, flow: InterviewFlow) => move(step, flow, 1)
export const previousStep = (step: InterviewStep, flow: InterviewFlow) => move(step, flow, -1)

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

/** 在庫にあるかを判定する言葉（D-54）。カテゴリ「主食」の食材名に含まれていればその麺がある */
const NOODLE_WORDS: Record<Noodle, string[]> = {
  udon: ['うどん', 'ウドン'],
  pasta: ['パスタ', 'スパゲッティ', 'ペンネ', 'マカロニ'],
  soba: ['そば', '蕎麦'],
}

/** 焼きそばは中華麺なので、そばの判定では言葉を消してから見る */
const withoutYakisoba = (name: string) => name.replaceAll('焼きそば', '').replaceAll('焼そば', '')

/** 在庫にある麺（うどん・パスタ・そばの順） */
export function stockNoodles(items: InventoryItem[]): Noodle[] {
  const names = items.filter((i) => i.category === 'staple').map((i) => withoutYakisoba(i.name))
  return NOODLES.filter((n) => names.some((name) => NOODLE_WORDS[n].some((w) => name.includes(w))))
}

/** 麺の選択肢。D-20 に従い、在庫のみなら在庫にある麺だけ */
export const noodleChoices = (items: InventoryItem[], allowShopping: boolean): Noodle[] =>
  allowShopping ? [...NOODLES] : stockNoodles(items)

/**
 * 答えを今の答えに合うものだけにする（D-54）。選択肢にない麺は選ばれていない状態にし、
 * 麺を選んでいなければ副菜はあり
 */
export function fitAnswers(answers: MealConditions, choices: Noodle[]): MealConditions {
  const noodle =
    !answers.riceCooked && answers.noodle && choices.includes(answers.noodle)
      ? answers.noodle
      : null
  return { ...answers, noodle, sideDish: noodle ? answers.sideDish : true }
}
