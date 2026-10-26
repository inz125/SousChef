// 「作った」ときの在庫の更新（D-12, D-37）。余った肉は冷凍で登録する（D-46）
import { estimateExpiresOn } from './expiry'
import type { Category, IsoDate, StorageLocation } from './food'
import type { InventoryItem, NewInventoryItem } from './inventory'
import { initialLocation } from './thaw'

/** 使った在庫がどうなったか */
export type CookedResult = 'used_up' | 'low' | 'left'

export const COOKED_RESULTS: Record<CookedResult, string> = {
  used_up: '使い切った',
  low: '少ない',
  left: 'まだある',
}

export type CookedChoice = { item: InventoryItem; result: CookedResult }

export type Leftover = { name: string; category: Category }

type CatalogEntry = { name: string; category: Category; location: StorageLocation }

const byExpiry = (a: InventoryItem, b: InventoryItem) => {
  if (a.expiresOn === b.expiresOn) return 0
  if (a.expiresOn === null) return 1
  if (b.expiresOn === null) return -1
  return a.expiresOn < b.expiresOn ? -1 : 1
}

/** 材料に当たる在庫の候補。同じ名前 → 名前の一部が一致、の順に、それぞれ期限が近い順 */
export function stockCandidates(ingredient: string, items: InventoryItem[]): InventoryItem[] {
  const exact = items.filter((i) => i.name === ingredient)
  const partial = items.filter(
    (i) => i.name !== ingredient && (i.name.includes(ingredient) || ingredient.includes(i.name)),
  )
  return [...exact.toSorted(byExpiry), ...partial.toSorted(byExpiry)]
}

/** カテゴリからの保存場所の初期値 */
export function defaultLocation(category: Category): StorageLocation {
  if (category === 'leafy' || category === 'root' || category === 'fruit') return 'vegetable'
  if (category === 'staple' || category === 'seasoning') return 'pantry'
  return 'fridge'
}

export function cookedChanges(
  choices: CookedChoice[],
  leftovers: Leftover[],
  catalog: CatalogEntry[],
  today: IsoDate,
): { removeIds: string[]; lowIds: string[]; add: NewInventoryItem[] } {
  return {
    removeIds: choices.filter((c) => c.result === 'used_up').map((c) => c.item.id),
    lowIds: choices
      .filter((c) => c.result === 'low' && c.item.quantity !== 'low')
      .map((c) => c.item.id),
    add: leftovers.map(({ name, category }) => {
      const location = initialLocation(
        category,
        catalog.find((e) => e.name === name)?.location ?? defaultLocation(category),
      )
      return {
        name,
        category,
        location,
        quantity: 'low',
        expiresOn: estimateExpiresOn({ name, category, location }, today),
        expiresOnEstimated: true,
        thawedOn: null,
      }
    }),
  }
}
