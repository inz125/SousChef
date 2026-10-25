import { addDays, expiryStatus } from './expiry'
import type { Category, IsoDate, StorageLocation } from './food'

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
  const [, month, day] = expiresOn.split('-').map(Number)
  return `${month}/${day}まで`
}

export function quantityAfterTap(quantity: Quantity): Quantity {
  return quantity === 'enough' ? 'low' : 'enough'
}
