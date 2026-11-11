import { useCallback, useState } from 'react'
import type { IsoDate } from '../domain/food'
import { itemsForTab, type InventoryItem } from '../domain/inventory'
import type { ThawChoice } from '../domain/thaw'
import type { InventoryRepository } from './InventoryRepository'
import { saveThaw } from './saveThaw'

const NONE: InventoryItem[] = []

/**
 * 献立・レシピの画面で使う在庫（期限が近い順）と、レシピからの解凍（D-49）。
 * current は一度でも読み込めた在庫で、それまでは null（材料の印を見直さない, D-69）
 */
export function useStock(repo: InventoryRepository, today: IsoDate) {
  const [current, setCurrent] = useState<InventoryItem[] | null>(null)
  const stock = current ?? NONE

  const reload = useCallback(
    () =>
      repo.list().then((list) => {
        setCurrent(itemsForTab(list, 'all'))
        return list
      }),
    [repo],
  )

  const thaw = useCallback(
    async (item: InventoryItem, choice: ThawChoice) => {
      await saveThaw(repo, item, choice, today)
      await reload()
    },
    [repo, today, reload],
  )

  return { stock, current, reload, thaw }
}
