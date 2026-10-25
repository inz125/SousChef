import { useEffect, useState } from 'react'
import { expiryStatus } from '../domain/expiry'
import { LOCATIONS, type StorageLocation } from '../domain/food'
import {
  formatExpiry,
  itemsForTab,
  QUANTITIES,
  quantityAfterTap,
  type InventoryItem,
  type InventoryTab,
  type NewInventoryItem,
} from '../domain/inventory'
import type { IsoDate } from '../domain/food'
import { AddItemForm } from './AddItemForm'
import type { CatalogEntry, InventoryRepository } from './InventoryRepository'

const UNDO_MS = 5000

const TABS: [InventoryTab, string][] = [['all', 'すべて'], ...Object.entries(LOCATIONS)] as [
  InventoryTab,
  string,
][]

type Props = { repo: InventoryRepository; today: IsoDate }

export function InventoryScreen({ repo, today }: Props) {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [tab, setTab] = useState<InventoryTab>('all')
  const [adding, setAdding] = useState(false)
  const [removed, setRemoved] = useState<InventoryItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([repo.list(), repo.catalog()])
      .then(([list, entries]) => {
        setItems(list)
        setCatalog(entries)
      })
      .catch(() => setError('在庫を読み込めませんでした'))
  }, [repo])

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [removed])

  async function save(action: () => Promise<void>) {
    try {
      setError(null)
      await action()
    } catch {
      setError('保存できませんでした。通信状況を確認してください')
    }
  }

  const replace = (item: InventoryItem) =>
    setItems((list) => list && list.map((i) => (i.id === item.id ? item : i)))

  const toggleQuantity = (item: InventoryItem) =>
    save(async () => {
      const quantity = quantityAfterTap(item.quantity)
      await repo.updateQuantity(item.id, quantity)
      replace({ ...item, quantity })
    })

  const remove = (item: InventoryItem) =>
    save(async () => {
      await repo.remove(item.id)
      setItems((list) => list && list.filter((i) => i.id !== item.id))
      setRemoved(item)
    })

  const undo = (item: InventoryItem) =>
    save(async () => {
      await repo.restore(item)
      setItems((list) => list && [...list, item])
      setRemoved(null)
    })

  const add = (item: NewInventoryItem) =>
    save(async () => {
      const added = await repo.add(item)
      setItems((list) => list && [...list, added])
      setCatalog((entries) => [
        ...entries.filter((e) => e.name !== added.name),
        { name: added.name, category: added.category, location: added.location },
      ])
      setAdding(false)
    })

  const visible = items ? itemsForTab(items, tab) : []

  return (
    <section className="inventory">
      <div role="tablist" className="segmented">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert">{error}</p>}

      {items && visible.length === 0 && <p className="empty">食材がありません</p>}
      <ul className="inventory-list">
        {visible.map((item) => (
          <li
            key={item.id}
            aria-label={item.name}
            data-expiry={expiryStatus(item.expiresOn, today)}
          >
            <div className="item-main">
              <span className="item-name">{item.name}</span>
              <span className="item-expiry">
                {formatExpiry(item.expiresOn, today)}
                {item.expiresOn && item.expiresOnEstimated && <small>（目安）</small>}
              </span>
            </div>
            <button
              type="button"
              className="quantity"
              data-quantity={item.quantity}
              onClick={() => toggleQuantity(item)}
            >
              {QUANTITIES[item.quantity]}
            </button>
            <button type="button" className="remove" onClick={() => remove(item)}>
              なくなった
            </button>
          </li>
        ))}
      </ul>

      {removed && (
        <div role="status" className="toast">
          {removed.name} を削除しました
          <button type="button" onClick={() => undo(removed)}>
            元に戻す
          </button>
        </div>
      )}

      {adding ? (
        <AddItemForm
          catalog={catalog}
          today={today}
          initialLocation={tab === 'all' ? 'fridge' : (tab as StorageLocation)}
          onSubmit={add}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="fab" onClick={() => setAdding(true)}>
          食材を追加
        </button>
      )}
    </section>
  )
}
