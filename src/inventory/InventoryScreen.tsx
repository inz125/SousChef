import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnline } from '../lib/useOnline'
import type { KeyValueStore } from '../offline/offlineCache'
import { ReceiptError, type ReceiptApi, type ReceiptItem } from '../receipt/ReceiptApi'
import { ReceiptSheet } from '../receipt/ReceiptSheet'
import { expiryStatus } from '../domain/expiry'
import { LOCATIONS, type IsoDate, type StorageLocation } from '../domain/food'
import type { receiptChanges } from '../domain/receipt'
import { canThaw, showThawBanner, type ThawChoice } from '../domain/thaw'
import {
  expiryBadge,
  formatExpiry,
  isThawing,
  itemsForTab,
  QUANTITIES,
  quantityAfterTap,
  type InventoryItem,
  type InventoryTab,
  type NewInventoryItem,
} from '../domain/inventory'
import type { CatalogEntry, InventoryEvent, InventoryRepository } from './InventoryRepository'
import { ItemForm } from './ItemForm'
import { FoodIllustration } from '../illustrations/FoodIllustration'
import { ItemMenu } from './ItemMenu'
import { LongPressButton } from './LongPressButton'
import { saveThaw } from './saveThaw'
import { ThawSheet } from './ThawSheet'

const UNDO_MS = 5000
const NOTICE_MS = 4000

const TABS = [['all', 'すべて'], ...Object.entries(LOCATIONS)] as [InventoryTab, string][]

const ACTION_TEXT: Record<InventoryEvent['action'], string> = {
  added: 'を追加しました',
  updated: 'を変更しました',
  removed: 'を削除しました',
}

/** 解凍の勧めで「今日はいい」を押した日（D-48）。端末ごとに覚える */
const BANNER_DISMISSED_KEY = 'souschef:thaw-banner-dismissed'

type Props = {
  repo: InventoryRepository
  receipt: ReceiptApi
  today: IsoDate
  me: string
  /** 解凍の勧めを出す時刻の判定に使う（D-48） */
  now: () => Date
  store: KeyValueStore
}

type Sheet = { mode: 'add' } | { mode: 'edit'; item: InventoryItem } | null

export function InventoryScreen({ repo, receipt, today, me, now, store }: Props) {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [tab, setTab] = useState<InventoryTab>('all')
  const [sheet, setSheet] = useState<Sheet>(null)
  // 長押しでメニューを開いている食材（D-56）
  const [menu, setMenu] = useState<InventoryItem | null>(null)
  const [removed, setRemoved] = useState<InventoryItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // レシートの読み取り中と、読み取った食材の確認（D-42）
  const [reading, setReading] = useState(false)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[] | null>(null)
  // 解凍する冷凍の肉（D-47）
  const [thawing, setThawing] = useState<InventoryItem | null>(null)
  const [bannerDismissedOn, setBannerDismissedOn] = useState(() => store.get(BANNER_DISMISSED_KEY))
  const online = useOnline()
  const photoInput = useRef<HTMLInputElement>(null)

  // 読み込みの通し番号。後から始めた読み込みや編集より前の古い結果で一覧を上書きしない
  const loadSeq = useRef(0)
  const reload = useCallback(() => {
    const seq = ++loadSeq.current
    return Promise.all([repo.list(), repo.catalog()])
      .then(([list, entries]) => {
        if (seq !== loadSeq.current) return
        setItems(list)
        setCatalog(entries)
      })
      .catch(() => seq === loadSeq.current && setError('在庫を読み込めませんでした'))
  }, [repo])

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

  /** 編集を保存し、すぐ画面に反映したうえでサーバの最新の状態を読み直す */
  async function save(action: () => Promise<void>) {
    try {
      setError(null)
      await action()
      reload()
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
      setMenu(null)
      const quantity = quantityAfterTap(item.quantity)
      await repo.updateQuantity(item.id, quantity)
      replace({ ...item, quantity })
    })

  const remove = (item: InventoryItem) =>
    save(async () => {
      await repo.remove(item.id)
      setItems((list) => list && list.filter((i) => i.id !== item.id))
      setSheet(null)
      setMenu(null)
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

  const thaw = (item: InventoryItem, choice: ThawChoice) =>
    save(async () => {
      await saveThaw(repo, item, choice, today)
      setThawing(null)
      setSheet(null)
    })

  const startThaw = (item: InventoryItem) => {
    setMenu(null)
    setThawing(item)
  }

  function dismissBanner() {
    store.set(BANNER_DISMISSED_KEY, today)
    setBannerDismissedOn(today)
  }

  async function readReceipt(photo: File) {
    setError(null)
    setReading(true)
    try {
      setReceiptItems(await receipt.read(photo))
    } catch (e) {
      setError(
        e instanceof ReceiptError
          ? e.message
          : 'レシートの読み取りに失敗しました。時間をおいてお試しください',
      )
    } finally {
      setReading(false)
    }
  }

  /** 確認画面の内容を登録する。途中で失敗しても、登録できた分は一覧に出すために読み直す */
  async function registerReceipt({ updates, adds }: ReturnType<typeof receiptChanges>) {
    try {
      for (const item of updates) await repo.update(item)
      for (const item of adds) await repo.add(item)
    } finally {
      reload()
    }
    setReceiptItems(null)
    setNotice(`${updates.length + adds.length} 件を在庫に登録しました`)
  }

  const visible = items ? itemsForTab(items, tab) : []
  const banner =
    items !== null &&
    showThawBanner({ items, now: now(), today, dismissedOn: bannerDismissedOn, online })

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
      {reading && <p role="status">レシートを読み取っています…</p>}

      {banner && (
        <section aria-label="解凍の勧め" className="card thaw-banner">
          <p>明日の肉を解凍しませんか？</p>
          <div className="choices wrap">
            {itemsForTab(items, 'freezer')
              .filter(canThaw)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`${item.name}を解凍`}
                  onClick={() => startThaw(item)}
                >
                  {item.name}
                </button>
              ))}
          </div>
          <button type="button" className="secondary" onClick={dismissBanner}>
            今日はいい
          </button>
        </section>
      )}

      {items && visible.length === 0 && <p className="empty">食材がありません</p>}
      {/* iPhone のホーム画面のような並び（D-56）。タップで編集、長押しでメニュー */}
      <ul className="food-grid">
        {visible.map((item) => {
          const badge = expiryBadge(item.expiresOn, today)
          return (
            <li
              key={item.id}
              aria-label={item.name}
              data-expiry={expiryStatus(item.expiresOn, today)}
              data-quantity={item.quantity}
            >
              <LongPressButton
                type="button"
                className="food-tile"
                aria-label={item.name}
                longPressDisabled={!online}
                onLongPress={() => setMenu(item)}
                onClick={() => setSheet({ mode: 'edit', item })}
              >
                <span className="tile-icon">
                  <FoodIllustration name={item.name} />
                  {badge && <span className="expiry-badge">{badge}</span>}
                </span>
                <span className="tile-name">{item.name}</span>
                {item.expiresOn && (
                  <span className="tile-expiry">
                    {formatExpiry(item.expiresOn, today)}
                    {item.expiresOnEstimated && <small>（目安）</small>}
                  </span>
                )}
                {/* 量は「少ない」のときだけ示す（D-41） */}
                {item.quantity === 'low' && <span className="tile-low">{QUANTITIES.low}</span>}
                {isThawing(item) && <span className="thaw-badge">解凍中</span>}
              </LongPressButton>
            </li>
          )
        })}
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
          onThaw={online ? () => startThaw(sheet.item) : undefined}
          onCancel={() => setSheet(null)}
        />
      )}
      {menu && (
        <ItemMenu
          item={menu}
          onToggleQuantity={() => toggleQuantity(menu)}
          onThaw={online && canThaw(menu) ? () => startThaw(menu) : undefined}
          onRemove={() => remove(menu)}
          onCancel={() => setMenu(null)}
        />
      )}
      {thawing && (
        <ThawSheet
          // 編集画面（key は食材の ID）と同時に開くので、同じ key にしない（重なると React が編集画面を取り残す）
          key={`thaw-${thawing.id}`}
          item={thawing}
          onSubmit={(choice) => thaw(thawing, choice)}
          onCancel={() => setThawing(null)}
        />
      )}
      {receiptItems && items && (
        <ReceiptSheet
          items={receiptItems}
          catalog={catalog}
          inventory={items}
          today={today}
          onSubmit={registerReceipt}
          onCancel={() => setReceiptItems(null)}
        />
      )}
      {!sheet && !menu && !receiptItems && !thawing && (
        // ヘッダー右上に置く（D-41）
        <>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="レシートの写真"
            onChange={(e) => {
              const photo = e.target.files?.[0]
              e.target.value = ''
              if (photo) readReceipt(photo)
            }}
          />
          <button
            type="button"
            className="header-action camera"
            aria-label="レシートを読み込む"
            disabled={reading || !online}
            onClick={() => photoInput.current?.click()}
          >
            📷
          </button>
          <button
            type="button"
            className="header-action"
            aria-label="食材を追加"
            disabled={reading}
            onClick={() => setSheet({ mode: 'add' })}
          >
            ＋
          </button>
        </>
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
