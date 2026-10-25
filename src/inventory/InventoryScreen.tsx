import { useCallback, useEffect, useState } from 'react'
import { expiryStatus } from '../domain/expiry'
import { LOCATIONS, type IsoDate, type StorageLocation } from '../domain/food'
import {
  formatExpiry,
  itemsForTab,
  QUANTITIES,
  quantityAfterTap,
  type InventoryItem,
  type InventoryTab,
  type NewInventoryItem,
} from '../domain/inventory'
import type { CatalogEntry, InventoryEvent, InventoryRepository } from './InventoryRepository'
import { ItemForm } from './ItemForm'

const UNDO_MS = 5000
const NOTICE_MS = 4000

const TABS = [['all', 'すべて'], ...Object.entries(LOCATIONS)] as [InventoryTab, string][]

const ACTION_TEXT: Record<InventoryEvent['action'], string> = {
  added: 'を追加しました',
  updated: 'を変更しました',
  removed: 'を削除しました',
}

type Props = { repo: InventoryRepository; today: IsoDate; me: string }

type Sheet = { mode: 'add' } | { mode: 'edit'; item: InventoryItem } | null

export function InventoryScreen({ repo, today, me }: Props) {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [tab, setTab] = useState<InventoryTab>('all')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [removed, setRemoved] = useState<InventoryItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    () =>
      Promise.all([repo.list(), repo.catalog()])
        .then(([list, entries]) => {
          setItems(list)
          setCatalog(entries)
        })
        .catch(() => setError('在庫を読み込めませんでした')),
    [repo],
  )

  useEffect(() => {
    reload()
  }, [reload])

  // もう一人の変更を反映して通知する（D-30）
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let active = true
    repo
      .subscribe((event) => {
        if (event.actorEmail.toLowerCase() === me.toLowerCase()) return
        reload()
        setNotice(`${event.actorName}さんが ${event.itemName} ${ACTION_TEXT[event.action]}`)
      })
      .then((u) => {
        if (!active) return u()
        unsubscribe = u
        // 最初の読み込みから購読開始までの間の変更を取りこぼさないよう読み直す
        reload()
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [repo, me, reload])

  // iOS はバックグラウンドで接続が切れるので、前面に戻ったら読み直す
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  useAutoClear(removed, setRemoved, UNDO_MS)
  useAutoClear(notice, setNotice, NOTICE_MS)

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

  const remember = ({ name, category, location }: InventoryItem) =>
    setCatalog((entries) => [
      ...entries.filter((e) => e.name !== name),
      { name, category, location },
    ])

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
      setSheet(null)
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
      remember(added)
      setSheet(null)
    })

  const update = (item: InventoryItem) =>
    save(async () => {
      await repo.update(item)
      replace(item)
      remember(item)
      setSheet(null)
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
            <button
              type="button"
              className="item-main"
              aria-label={`${item.name}を編集`}
              onClick={() => setSheet({ mode: 'edit', item })}
            >
              <span className="item-name">{item.name}</span>
              <span className="item-expiry">
                {formatExpiry(item.expiresOn, today)}
                {item.expiresOn && item.expiresOnEstimated && <small>（目安）</small>}
              </span>
            </button>
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

      {notice && (
        <div role="status" aria-label="お知らせ" className="toast notice">
          {notice}
        </div>
      )}

      {removed && (
        <div role="status" aria-label="元に戻す" className="toast">
          {removed.name} を削除しました
          <button type="button" onClick={() => undo(removed)}>
            元に戻す
          </button>
        </div>
      )}

      {sheet?.mode === 'add' && (
        <ItemForm
          mode="add"
          catalog={catalog}
          today={today}
          initialLocation={tab === 'all' ? 'fridge' : (tab as StorageLocation)}
          onSubmit={add}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.mode === 'edit' && (
        <ItemForm
          key={sheet.item.id}
          mode="edit"
          original={sheet.item}
          catalog={catalog}
          today={today}
          onSubmit={update}
          onRemove={() => remove(sheet.item)}
          onCancel={() => setSheet(null)}
        />
      )}
      {!sheet && (
        <button type="button" className="fab" onClick={() => setSheet({ mode: 'add' })}>
          食材を追加
        </button>
      )}
    </section>
  )
}

function useAutoClear<T>(value: T | null, clear: (v: null) => void, ms: number) {
  useEffect(() => {
    if (value === null) return
    const timer = setTimeout(() => clear(null), ms)
    return () => clearTimeout(timer)
  }, [value, clear, ms])
}
