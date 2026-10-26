// 買ってきた肉の冷凍と解凍（D-46〜D-49）
import { stockCandidates } from './cooking'
import { addDays } from './expiry'
import type { Category, IsoDate, StorageLocation } from './food'
import {
  isThawing,
  THAWED_DAYS,
  type InventoryItem,
  type NewInventoryItem,
  type Quantity,
} from './inventory'

/** 新しく登録するときの保存場所の初期値。肉は冷凍にする（D-46） */
export function initialLocation(category: Category, fallback: StorageLocation): StorageLocation {
  return category === 'meat' ? 'freezer' : fallback
}

export const canThaw = (item: InventoryItem) =>
  item.category === 'meat' && item.location === 'freezer'

/** 全部を解凍するか、一部を解凍して冷凍の行に残す量を選ぶか */
export type ThawChoice = { kind: 'all' } | { kind: 'part'; remaining: Quantity }

/** 解凍したときの在庫の変更（D-47） */
export function thawChanges(
  item: InventoryItem,
  choice: ThawChoice,
  today: IsoDate,
): { update: InventoryItem; add: NewInventoryItem | null } {
  const thawed = {
    location: 'fridge',
    thawedOn: today,
    expiresOn: addDays(today, THAWED_DAYS),
    expiresOnEstimated: true,
  } as const
  if (choice.kind === 'all') return { update: { ...item, ...thawed }, add: null }
  return {
    update: { ...item, quantity: choice.remaining },
    add: { name: item.name, category: item.category, quantity: 'enough', ...thawed },
  }
}

/** 材料に当たる在庫の先頭が冷凍の肉なら、その行（「冷凍・要解凍」の印を付ける。D-49） */
export function frozenMeatFor(ingredient: string, items: InventoryItem[]) {
  const [first] = stockCandidates(ingredient, items)
  return first && canThaw(first) ? first : undefined
}

/** 材料のうち在庫の冷凍の肉に当たるもの。同じ在庫の行は 1 回だけ */
export function frozenMeatsOf(
  ingredients: { name: string; source: string }[],
  items: InventoryItem[],
): InventoryItem[] {
  const found = ingredients
    .filter((i) => i.source === 'stock')
    .map((i) => frozenMeatFor(i.name, items))
    .filter((i) => i !== undefined)
  return [...new Map(found.map((i) => [i.id, i])).values()]
}

/** 解凍の勧めの帯を出す時刻（D-48） */
const BANNER_HOUR = 18

export type ThawBannerState = {
  items: InventoryItem[]
  now: Date
  today: IsoDate
  /** 「今日はいい」を押した日 */
  dismissedOn: IsoDate | null
  online: boolean
}

export function showThawBanner({ items, now, today, dismissedOn, online }: ThawBannerState) {
  return (
    online &&
    dismissedOn !== today &&
    now.getHours() >= BANNER_HOUR &&
    items.some(canThaw) &&
    !items.some((i) => i.category === 'meat' && isThawing(i))
  )
}
