import { useCallback, useState } from 'react'
import type { IsoDate } from '../domain/food'
import { itemsForTab, type InventoryItem } from '../domain/inventory'
import type { ThawChoice } from '../domain/thaw'
import type { InventoryRepository } from './InventoryRepository'
import { saveThaw } from './saveThaw'

/** 献立・レシピの画面で使う在庫（期限が近い順）と、レシピからの解凍（D-49） */
export function useStock(repo: InventoryRepository, today: IsoDate) {
  const [stock, setStock] = useState<InventoryItem[]>([])

  const reload = useCallback(
    () =>
      repo.list().then((list) => {
        setStock(itemsForTab(list, 'all'))
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

  return { stock, reload, thaw }
}
