import { addDays, estimateExpiresOn, expiryStatus } from './expiry'
import type { Category, FoodKind, IsoDate, StorageLocation } from './food'

/** 量（D-09）。「ない」は在庫から削除する */
export type Quantity = 'enough' | 'low'

export const QUANTITIES: Record<Quantity, string> = { enough: 'ある', low: '少ない' }

export type InventoryItem = {
  id: string
  name: string
  category: Category
  location: StorageLocation
  quantity: Quantity
  expiresOn: IsoDate | null
  expiresOnEstimated: boolean
  /** 解凍した日。冷蔵にあってこの日があれば「解凍中」（D-47） */
  thawedOn: IsoDate | null
}

export type NewInventoryItem = Omit<InventoryItem, 'id'>

export type InventoryTab = 'all' | StorageLocation

/** タブに表示する食材を、期限が近い順（期限なしは最後）・同じなら名前順で返す（D-26） */
export function itemsForTab(items: InventoryItem[], tab: InventoryTab): InventoryItem[] {
  return items
    .filter((i) => tab === 'all' || i.location === tab)
    .toSorted((a, b) => {
      if (a.expiresOn !== b.expiresOn) {
        if (a.expiresOn === null) return 1
        if (b.expiresOn === null) return -1
        return a.expiresOn < b.expiresOn ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'ja')
    })
}

export function formatExpiry(expiresOn: IsoDate | null, today: IsoDate): string {
  if (expiresOn === null) return ''
  if (expiryStatus(expiresOn, today) === 'expired') return '期限切れ'
  if (expiresOn === today) return '今日まで'
  for (const days of [1, 2]) {
    if (expiresOn === addDays(today, days)) return `あと${days}日`
  }
  // 1 行に収めるため「まで」は付けない（D-75）
  const [, month, day] = expiresOn.split('-').map(Number)
  return `${month}/${day}`
}

/** ホーム画面風の一覧でイラストの右上に出すバッジ（D-56）。期限切れは「!」、今日は「今日」、1・2 日後は日数（D-75） */
export function expiryBadge(expiresOn: IsoDate | null, today: IsoDate): string | null {
  if (expiresOn === null) return null
  if (expiryStatus(expiresOn, today) === 'expired') return '!'
  if (expiresOn === today) return '今日'
  for (const days of [1, 2]) {
    if (expiresOn === addDays(today, days)) return String(days)
  }
  return null
}

/** 入力画面の期限のボタン（D-79） */
export type QuickExpiry = '3days' | '1week' | '1month'

export const QUICK_EXPIRIES: Record<QuickExpiry, string> = {
  '3days': '+3日',
  '1week': '+1週間',
  '1month': '+1か月',
}

/** 今日から数えた期限。+1か月は来月の同じ日で、その日がなければ来月の末日 */
export function quickExpiry(today: IsoDate, kind: QuickExpiry): IsoDate {
  if (kind === '3days') return addDays(today, 3)
  if (kind === '1week') return addDays(today, 7)
  const [y, m, d] = today.split('-').map(Number)
  const [year, month] = m === 12 ? [y + 1, 1] : [y, m + 1]
  // Date.UTC の日に 0 を渡すと前の月の末日になる
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`
}

export function quantityAfterTap(quantity: Quantity): Quantity {
  return quantity === 'enough' ? 'low' : 'enough'
}

/** 解凍した肉の期限の目安は、解凍した日の 2 日後（D-47） */
export const THAWED_DAYS = 2

// 項目を足す前に端末へ保存した在庫（D-17）には thawedOn がないので、null と同じに扱う
export const isThawing = (item: Pick<InventoryItem, 'location' | 'thawedOn'>) =>
  item.location === 'fridge' && Boolean(item.thawedOn)

/** 期限の目安。解凍中なら解凍した日から、それ以外は今日から推定する */
export function reestimateExpiresOn(
  item: FoodKind & Pick<InventoryItem, 'thawedOn'>,
  today: IsoDate,
): IsoDate {
  return isThawing(item) ? addDays(item.thawedOn!, THAWED_DAYS) : estimateExpiresOn(item, today)
}

/** 編集後の解凍した日。冷蔵以外に移すと解凍中ではなくなる */
export function thawedOnAfterEdit(original: InventoryItem, edited: FoodKind): IsoDate | null {
  return edited.location === 'fridge' ? original.thawedOn : null
}

/** 編集後の期限。目安の期限だけ、保存場所かカテゴリが変わったら再推定する（D-29, D-47） */
export function expiryAfterEdit(
  original: InventoryItem,
  edited: FoodKind,
  today: IsoDate,
): Pick<InventoryItem, 'expiresOn' | 'expiresOnEstimated'> {
  const kept = { expiresOn: original.expiresOn, expiresOnEstimated: original.expiresOnEstimated }
  if (!original.expiresOnEstimated) return kept
  if (edited.location === original.location && edited.category === original.category) return kept
  const thawedOn = thawedOnAfterEdit(original, edited)
  return {
    expiresOn: reestimateExpiresOn({ ...edited, thawedOn }, today),
    expiresOnEstimated: true,
  }
}

/** 期限が近い食材（D-76）。期限が今日〜2 日後の食材名を、期限が近い順・同じなら名前順に重ねずに返す */
export function expiringSoonNames(items: InventoryItem[], today: IsoDate): string[] {
  const last = addDays(today, 2)
  const names = itemsForTab(items, 'all')
    .filter((i) => i.expiresOn !== null && i.expiresOn >= today && i.expiresOn <= last)
    .map((i) => i.name)
  return [...new Set(names)]
}
