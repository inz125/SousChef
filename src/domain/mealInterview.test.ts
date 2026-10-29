import type { InventoryItem } from './inventory'
import type { MealConditions } from '../../supabase/functions/_shared/meals.ts'
import {
  fitAnswers,
  formatDaysLeft,
  INTERVIEW_STEPS,
  mustUseCandidates,
  nextStep,
  noodleChoices,
  previousStep,
  questionNumber,
  stockNoodles,
  type InterviewFlow,
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

const ANSWERS: MealConditions = {
  maxMinutes: 30,
  allowShopping: false,
  riceCooked: true,
  noodle: null,
  soup: true,
  sideDish: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

/** 在庫あり・ご飯は炊いてある（今までどおりの流れ） */
const flow = (over: Partial<MealConditions> = {}, hasStock = true): InterviewFlow => ({
  hasStock,
  answers: { ...ANSWERS, ...over },
})

describe('質問の順番（D-53・D-54）', () => {
  it('調理時間 → 食材 → ご飯 → 麺 → 使いたい食材 → 汁物 → 副菜の有無 → 副菜のレンジ → 気分 → 確認', () => {
    expect(INTERVIEW_STEPS).toEqual([
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
    ])
    expect(nextStep('minutes', flow())).toBe('shopping')
    expect(nextStep('shopping', flow())).toBe('rice')
    expect(nextStep('mood', flow())).toBe('confirm')
    expect(previousStep('shopping', flow())).toBe('minutes')
    expect(previousStep('confirm', flow())).toBe('mood')
  })

  it('在庫がなければ使いたい食材を飛ばす（戻るときも）', () => {
    expect(nextStep('rice', flow({}, false))).toBe('soup')
    expect(previousStep('soup', flow({}, false))).toBe('rice')
    expect(nextStep('rice', flow())).toBe('mustUse')
    expect(previousStep('soup', flow())).toBe('mustUse')
  })

  it('ご飯が炊いてあれば麺を飛ばし、炊いてなければ麺を聞く', () => {
    expect(nextStep('rice', flow({ riceCooked: true }))).toBe('mustUse')
    expect(nextStep('rice', flow({ riceCooked: false }))).toBe('noodle')
    expect(previousStep('mustUse', flow({ riceCooked: true }))).toBe('rice')
    expect(previousStep('mustUse', flow({ riceCooked: false }))).toBe('noodle')
  })

  it('麺を選んだときだけ副菜の有無を聞き、副菜なしなら副菜のレンジを飛ばす（戻るときも）', () => {
    expect(nextStep('soup', flow())).toBe('side')
    expect(nextStep('soup', flow({ riceCooked: false, noodle: null }))).toBe('side')
    const noodle = { riceCooked: false, noodle: 'udon' } as const
    expect(nextStep('soup', flow(noodle))).toBe('sideDish')
    expect(nextStep('sideDish', flow({ ...noodle, sideDish: true }))).toBe('side')
    expect(nextStep('sideDish', flow({ ...noodle, sideDish: false }))).toBe('mood')
    expect(previousStep('mood', flow({ ...noodle, sideDish: false }))).toBe('sideDish')
    expect(previousStep('side', flow(noodle))).toBe('sideDish')
    expect(previousStep('side', flow())).toBe('soup')
  })

  it('最初の質問の前・確認の後はない', () => {
    expect(previousStep('minutes', flow())).toBeNull()
    expect(nextStep('confirm', flow())).toBeNull()
  })

  it('何問目かは飛ばしても変わらない（全 9 問）', () => {
    expect(questionNumber('minutes')).toBe(1)
    expect(questionNumber('rice')).toBe(3)
    expect(questionNumber('mustUse')).toBe(5)
    expect(questionNumber('mood')).toBe(9)
  })
})

describe('stockNoodles（D-54）', () => {
  const staple = (name: string) => item({ name, category: 'staple' })

  it('カテゴリ「主食」の食材名に含まれる言葉で、在庫にある麺を判定する', () => {
    expect(stockNoodles([staple('冷凍うどん')])).toEqual(['udon'])
    expect(stockNoodles([staple('稲庭ウドン')])).toEqual(['udon'])
    for (const name of ['パスタ', 'スパゲッティ', 'ペンネ', 'マカロニ']) {
      expect(stockNoodles([staple(`早ゆで${name}`)])).toEqual(['pasta'])
    }
    expect(stockNoodles([staple('乾そば')])).toEqual(['soba'])
    expect(stockNoodles([staple('十割蕎麦')])).toEqual(['soba'])
  })

  it('「焼きそば」「焼そば」はそばにしない', () => {
    expect(stockNoodles([staple('焼きそば麺'), staple('焼そば')])).toEqual([])
  })

  it('主食以外のカテゴリは数えない', () => {
    expect(stockNoodles([item({ name: 'うどんスープの素', category: 'seasoning' })])).toEqual([])
  })

  it('うどん・パスタ・そばの順に、重ねずに返す', () => {
    expect(
      stockNoodles([staple('そば'), staple('ゆでうどん'), staple('冷凍うどん'), staple('パスタ')]),
    ).toEqual(['udon', 'pasta', 'soba'])
  })
})

describe('noodleChoices（D-54）', () => {
  const stock = [item({ name: '冷凍うどん', category: 'staple' })]

  it('買い足し OK なら 3 つとも、在庫のみなら在庫にある麺だけ', () => {
    expect(noodleChoices(stock, true)).toEqual(['udon', 'pasta', 'soba'])
    expect(noodleChoices(stock, false)).toEqual(['udon'])
    expect(noodleChoices([], false)).toEqual([])
  })
})

describe('fitAnswers（D-54）', () => {
  const ALL = ['udon', 'pasta', 'soba'] as const

  it('選択肢にある麺と副菜の答えはそのまま残す', () => {
    const a = { ...ANSWERS, riceCooked: false, noodle: 'pasta', sideDish: false } as const
    expect(fitAnswers(a, [...ALL])).toEqual(a)
  })

  it('選択肢にない麺は選ばれていない状態にし、副菜はありに戻す', () => {
    const a = { ...ANSWERS, riceCooked: false, noodle: 'pasta', sideDish: false } as const
    expect(fitAnswers(a, ['udon'])).toEqual({ ...a, noodle: null, sideDish: true })
  })

  it('ご飯が炊いてあれば麺は選ばず、副菜はあり', () => {
    const a = { ...ANSWERS, riceCooked: true, noodle: 'udon', sideDish: false } as const
    expect(fitAnswers(a, [...ALL])).toEqual({ ...a, noodle: null, sideDish: true })
  })
})
