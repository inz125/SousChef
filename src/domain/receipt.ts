// レシートから読み取った食材を在庫に登録するときの組み立て（D-42）
import { stockCandidates } from './cooking'
import { estimateExpiresOn } from './expiry'
import type { Category, IsoDate, StorageLocation } from './food'
import type { InventoryItem, NewInventoryItem } from './inventory'

/** AI が読み取った食材 */
export type ReceiptItem = { name: string; category: Category; location: StorageLocation }

type CatalogEntry = ReceiptItem

/** 確認画面の 1 行。名前は入力途中の値のまま持つ（空白の除去は登録時） */
export type ReceiptDraft = ReceiptItem & { key: number; checked: boolean }

/** 初期値は補完候補（過去の登録）→ AI の推定の順 */
export function receiptDrafts(items: ReceiptItem[], catalog: CatalogEntry[]): ReceiptDraft[] {
  return items.map((item, key) => {
    const known = catalog.find((e) => e.name === item.name)
    return {
      key,
      checked: true,
      name: item.name,
      category: known?.category ?? item.category,
      location: known?.location ?? item.location,
    }
  })
}

/** 名前を書き換える。補完候補にある名前なら、カテゴリ・場所もその値に入れ直す（D-27） */
export function renameDraft(draft: ReceiptDraft, name: string, catalog: CatalogEntry[]) {
  const known = catalog.find((e) => e.name === name.trim())
  return known
    ? { ...draft, name, category: known.category, location: known.location }
    : { ...draft, name }
}

/** 名前が在庫の食材と完全一致する場合の、更新対象（期限が近い順の先頭） */
export function stockOf(name: string, inventory: InventoryItem[]): InventoryItem | undefined {
  const trimmed = name.trim()
  return stockCandidates(trimmed, inventory).find((i) => i.name === trimmed)
}

export function receiptChanges(
  drafts: ReceiptDraft[],
  inventory: InventoryItem[],
  today: IsoDate,
): { adds: NewInventoryItem[]; updates: InventoryItem[] } {
  const adds: NewInventoryItem[] = []
  const updates: InventoryItem[] = []
  const done = new Set<string>()
  for (const draft of drafts) {
    const name = draft.name.trim()
    if (!draft.checked || !name || done.has(name)) continue
    done.add(name)
    const existing = stockOf(name, inventory)
    if (existing) {
      updates.push({
        ...existing,
        quantity: 'enough',
        expiresOn: estimateExpiresOn(existing, today),
        expiresOnEstimated: true,
      })
    } else {
      const { category, location } = draft
      adds.push({
        name,
        category,
        location,
        quantity: 'enough',
        expiresOn: estimateExpiresOn({ name, category, location }, today),
        expiresOnEstimated: true,
      })
    }
  }
  return { adds, updates }
}
