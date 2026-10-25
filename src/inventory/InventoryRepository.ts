import type { Category, StorageLocation } from '../domain/food'
import type { InventoryItem, NewInventoryItem, Quantity } from '../domain/inventory'

/** 過去に登録した食材（補完候補）。最後に登録したときのカテゴリ・場所を覚える */
export type CatalogEntry = { name: string; category: Category; location: StorageLocation }

/** 在庫の保存先の境界。本番は Supabase、テストは FakeInventoryRepository */
export interface InventoryRepository {
  list(): Promise<InventoryItem[]>
  /** 追加すると補完候補も更新される */
  add(item: NewInventoryItem): Promise<InventoryItem>
  updateQuantity(id: string, quantity: Quantity): Promise<void>
  remove(id: string): Promise<void>
  /** 削除した食材を同じ ID で戻す */
  restore(item: InventoryItem): Promise<void>
  catalog(): Promise<CatalogEntry[]>
}
