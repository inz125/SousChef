import { monthOf, monthRange, monthWeeks, shiftMonth } from './calendar'

describe('monthWeeks（D-45）', () => {
  it('日曜始まりの週ごとに並べ、前後の月の分は空ける', () => {
    // 2026-10-01 は木曜日
    const weeks = monthWeeks('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weeks[1][0]).toBe('2026-10-04')
    expect(weeks[4]).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ])
  })

  it('月の最後の週の残りも空ける', () => {
    // 2026-11-30 は月曜日
    const weeks = monthWeeks('2026-11')
    expect(weeks.at(-1)).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null])
  })

  it('うるう年の 2 月も日数どおり', () => {
    expect(monthWeeks('2028-02').flat().filter(Boolean).at(-1)).toBe('2028-02-29')
  })
})

describe('月の操作', () => {
  it('日付から月を取り出す', () => {
    expect(monthOf('2026-10-26')).toBe('2026-10')
  })

  it('前後の月へ移る（年をまたぐ）', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
  })

  it('月の初日と末日', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
