// 調理履歴のカレンダー（D-45）の日付計算。月は 'YYYY-MM'、日付は 'YYYY-MM-DD'
import type { IsoDate } from './food'

/** 'YYYY-MM' */
export type YearMonth = string

const pad = (n: number) => String(n).padStart(2, '0')

const parse = (month: YearMonth) => month.split('-').map(Number) as [number, number]

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

export const monthOf = (date: IsoDate): YearMonth => date.slice(0, 7)

export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const [y, m] = parse(month)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function monthRange(month: YearMonth): { from: IsoDate; to: IsoDate } {
  const [y, m] = parse(month)
  return { from: `${month}-01`, to: `${month}-${pad(daysIn(y, m))}` }
}

/** 日曜始まりの週ごとの日付。前後の月の分は null */
export function monthWeeks(month: YearMonth): (IsoDate | null)[][] {
  const [y, m] = parse(month)
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const cells: (IsoDate | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysIn(y, m) }, (_, n) => `${month}-${pad(n + 1)}`),
  ]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}
