import type { InventoryItem } from './inventory'
import {
  formatDaysLeft,
  INTERVIEW_STEPS,
  mustUseCandidates,
  nextStep,
  previousStep,
  questionNumber,
} from './mealInterview'

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: crypto.randomUUID(),
  name: '食材',
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  thawedOn: null,
  ...over,
})

const TODAY = '2026-10-25'

describe('formatDaysLeft（D-53）', () => {
  it('今日なら「今日まで」、先なら「あと N 日」、過ぎていれば「N 日過ぎ」', () => {
    expect(formatDaysLeft('2026-10-25', TODAY)).toBe('今日まで')
    expect(formatDaysLeft('2026-10-26', TODAY)).toBe('あと 1 日')
    expect(formatDaysLeft('2026-10-30', TODAY)).toBe('あと 5 日')
    expect(formatDaysLeft('2026-10-24', TODAY)).toBe('1 日過ぎ')
    expect(formatDaysLeft('2026-10-20', TODAY)).toBe('5 日過ぎ')
  })

  it('月・年をまたいでも日数を数える', () => {
    expect(formatDaysLeft('2026-11-02', TODAY)).toBe('あと 8 日')
    expect(formatDaysLeft('2027-01-01', '2026-12-31')).toBe('あと 1 日')
    expect(formatDaysLeft('2026-12-31', '2027-01-01')).toBe('1 日過ぎ')
  })

  it('期限なしは表示しない', () => {
    expect(formatDaysLeft(null, TODAY)).toBe('')
  })
})

describe('mustUseCandidates（D-53）', () => {
  it('期限が近い順（期限なしは最後、同じなら名前順）に並べる', () => {
    const list = mustUseCandidates([
      item({ name: 'ツナ缶', expiresOn: null }),
      item({ name: '豆腐', expiresOn: '2026-10-30' }),
      item({ name: '牛乳', expiresOn: '2026-10-27', expiresOnEstimated: true }),
      item({ name: '鶏むね肉', expiresOn: '2026-10-25' }),
      item({ name: 'ひき肉', expiresOn: '2026-10-24' }),
    ])
    expect(list).toEqual([
      { name: 'ひき肉', expiresOn: '2026-10-24', estimated: false },
      { name: '鶏むね肉', expiresOn: '2026-10-25', estimated: false },
      { name: '牛乳', expiresOn: '2026-10-27', estimated: true },
      { name: '豆腐', expiresOn: '2026-10-30', estimated: false },
      { name: 'ツナ缶', expiresOn: null, estimated: false },
    ])
  })

  it('同じ名前の食材は 1 つにまとめ、期限が近い方を使う', () => {
    const list = mustUseCandidates([
      item({ name: '鶏もも肉', location: 'freezer', expiresOn: '2026-11-20' }),
      item({ name: '鶏もも肉', expiresOn: '2026-10-27', expiresOnEstimated: true }),
      item({ name: 'キャベツ', expiresOn: null }),
      item({ name: 'キャベツ', expiresOn: '2026-11-01' }),
    ])
    expect(list).toEqual([
      { name: '鶏もも肉', expiresOn: '2026-10-27', estimated: true },
      { name: 'キャベツ', expiresOn: '2026-11-01', estimated: false },
    ])
  })
})

describe('質問の順番（D-53）', () => {
  it('調理時間 → 食材 → 使いたい食材 → 汁物 → 副菜 → 気分 → 確認', () => {
    expect(INTERVIEW_STEPS).toEqual([
      'minutes',
      'shopping',
      'mustUse',
      'soup',
      'side',
      'mood',
      'confirm',
    ])
    expect(nextStep('minutes', true)).toBe('shopping')
    expect(nextStep('mood', true)).toBe('confirm')
    expect(previousStep('shopping', true)).toBe('minutes')
    expect(previousStep('confirm', true)).toBe('mood')
  })

  it('在庫がなければ使いたい食材を飛ばす（戻るときも）', () => {
    expect(nextStep('shopping', false)).toBe('soup')
    expect(previousStep('soup', false)).toBe('shopping')
    expect(nextStep('shopping', true)).toBe('mustUse')
    expect(previousStep('soup', true)).toBe('mustUse')
  })

  it('最初の質問の前・確認の後はない', () => {
    expect(previousStep('minutes', true)).toBeNull()
    expect(nextStep('confirm', true)).toBeNull()
  })

  it('何問目かは飛ばしても変わらない（全 6 問）', () => {
    expect(questionNumber('minutes')).toBe(1)
    expect(questionNumber('soup')).toBe(4)
    expect(questionNumber('mood')).toBe(6)
  })
})
