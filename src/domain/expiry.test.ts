import { addDays, estimateExpiryDays, estimateExpiresOn, expiryStatus } from './expiry'

describe('estimateExpiryDays', () => {
  it('カテゴリと保存場所から目安日数を返す', () => {
    expect(estimateExpiryDays({ name: '豚バラ肉', category: 'meat', location: 'fridge' })).toBe(3)
    expect(estimateExpiryDays({ name: '豚バラ肉', category: 'meat', location: 'freezer' })).toBe(30)
    expect(estimateExpiryDays({ name: 'にんじん', category: 'root', location: 'vegetable' })).toBe(
      21,
    )
  })

  it('主要食材は個別値をカテゴリ値より優先する', () => {
    expect(estimateExpiryDays({ name: '豚ひき肉', category: 'meat', location: 'fridge' })).toBe(2)
    expect(estimateExpiryDays({ name: 'まぐろ刺身', category: 'fish', location: 'fridge' })).toBe(1)
    expect(estimateExpiryDays({ name: 'もやし', category: 'leafy', location: 'vegetable' })).toBe(2)
  })

  it('個別値がその保存場所を定めていなければカテゴリ値を使う', () => {
    // もやしの冷凍は個別値なし → 葉野菜の冷凍値
    expect(estimateExpiryDays({ name: 'もやし', category: 'leafy', location: 'freezer' })).toBe(30)
  })

  it('個別値は対象カテゴリの食材にだけ適用する', () => {
    // 「鶏」を含むが調味料なので鶏肉の個別値は使わない
    expect(
      estimateExpiryDays({ name: '鶏ガラスープの素', category: 'seasoning', location: 'fridge' }),
    ).toBe(90)
    expect(estimateExpiryDays({ name: 'パンプキン', category: 'root', location: 'pantry' })).toBe(
      14,
    )
  })

  it('食材名の表記ゆれ（挽肉・ミンチ）も個別値に一致する', () => {
    expect(estimateExpiryDays({ name: '牛挽肉', category: 'meat', location: 'fridge' })).toBe(2)
    expect(estimateExpiryDays({ name: '鶏ミンチ', category: 'meat', location: 'fridge' })).toBe(2)
  })
})

describe('addDays', () => {
  it('日付文字列に日数を加算する（月・年またぎ）', () => {
    expect(addDays('2026-10-25', 3)).toBe('2026-10-28')
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('estimateExpiresOn', () => {
  it('登録日に目安日数を加えた日付を返す', () => {
    expect(
      estimateExpiresOn({ name: '豚バラ肉', category: 'meat', location: 'fridge' }, '2026-10-25'),
    ).toBe('2026-10-28')
  })
})

describe('expiryStatus', () => {
  const today = '2026-10-25'

  it('期限を過ぎていれば expired', () => {
    expect(expiryStatus('2026-10-24', today)).toBe('expired')
  })

  it('今日〜2日後なら soon', () => {
    expect(expiryStatus('2026-10-25', today)).toBe('soon')
    expect(expiryStatus('2026-10-27', today)).toBe('soon')
  })

  it('3日後以降なら ok', () => {
    expect(expiryStatus('2026-10-28', today)).toBe('ok')
  })

  it('期限が未設定なら unknown', () => {
    expect(expiryStatus(null, today)).toBe('unknown')
  })
})
