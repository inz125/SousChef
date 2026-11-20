import type { IsoDate } from '../domain/food'
import type { InventoryItem } from '../domain/inventory'
import { thawChanges, type ThawChoice } from '../domain/thaw'
import type { InventoryRepository } from './InventoryRepository'

/** 解凍を在庫に保存する（D-47） */
export async function saveThaw(
  repo: InventoryRepository,
  item: InventoryItem,
  choice: ThawChoice,
  today: IsoDate,
) {
  const { update, add } = thawChanges(item, choice, today)
  // 冷蔵の行を先に作る。冷凍の残りを「少ない」にしたとき、常備食品が買い物リストに載らないように（D-73）
  if (add) await repo.add(add)
  await repo.update(update)
}
