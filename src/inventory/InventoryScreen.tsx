import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useOnline } from '../lib/useOnline'
import type { KeyValueStore } from '../offline/offlineCache'
import type { ReceiptReader } from '../receipt/receiptReader'
import { ReceiptSheet } from '../receipt/ReceiptSheet'
import { expiryStatus } from '../domain/expiry'
import { LOCATIONS, type IsoDate, type StorageLocation } from '../domain/food'
import type { receiptChanges } from '../domain/receipt'
import { canThaw, showThawBanner, type ThawChoice } from '../domain/thaw'
import {
  itemsForTab,
  quantityAfterTap,
  type InventoryItem,
  type InventoryTab,
  type NewInventoryItem,
} from '../domain/inventory'
import {
  autoShoppingNames,
  hasUnchecked,
  isStocked,
  namesMatch,
  type ShoppingItem,
} from '../domain/shopping'
import type { ShoppingRepository } from '../shopping/ShoppingRepository'
import { ShoppingAddForm, ShoppingList } from '../shopping/ShoppingList'
import type { CatalogEntry, InventoryEvent, InventoryRepository } from './InventoryRepository'
import { ItemForm } from './ItemForm'
import { ItemMenu, type Anchor } from './ItemMenu'
import { LongPressButton } from './LongPressButton'
import { saveThaw } from './saveThaw'
import { SwipePager } from '../ui/SwipePager'
import { ThawSheet } from './ThawSheet'
import { TileFace } from './TileFace'

const UNDO_MS = 5000
const NOTICE_MS = 4000

/** 保存場所の区分と、右端の買い物リスト（D-72） */
type Page = InventoryTab | 'shopping'

const TABS = [['all', 'すべて'], ...Object.entries(LOCATIONS), ['shopping', '買い物']] as [
  Page,
  string,
][]

const ACTION_TEXT: Record<InventoryEvent['action'], string> = {
  added: 'を追加しました',
  updated: 'を変更しました',
  removed: 'を削除しました',
}

/** 解凍の勧めで「今日はいい」を押した日（D-48）。端末ごとに覚える */
const BANNER_DISMISSED_KEY = 'souschef:thaw-banner-dismissed'

type Props = {
  repo: InventoryRepository
  /** 買い物リストと常備食品（D-71〜D-74） */
  shopping: ShoppingRepository
  /** レシートの読み取り。タブを移っても続くようアプリで 1 つ持つ（D-70） */
  receipt: ReceiptReader
  today: IsoDate
  me: string
  /** 解凍の勧めを出す時刻の判定に使う（D-48） */
  now: () => Date
  store: KeyValueStore
}

type Sheet = { mode: 'add' } | { mode: 'edit'; item: InventoryItem } | { mode: 'shop' } | null

/** 削除した食材。listed: 買い物リストに入れたか（自動で載った・「買い物リストへ」を押した。D-74） */
type Removed = { item: InventoryItem; listed: boolean }

export function InventoryScreen({ repo, shopping, receipt, today, me, now, store }: Props) {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [tab, setTab] = useState<Page>('all')
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [stocked, setStocked] = useState<string[]>([])
  const [sheet, setSheet] = useState<Sheet>(null)
  // 長押しでメニューを開いている食材と、その画面上の位置（D-56・D-59）
  const [menu, setMenu] = useState<{ item: InventoryItem; anchor: Anchor } | null>(null)
  const [removed, setRemoved] = useState<Removed | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // レシートの読み取り中と、読み取った食材の確認（D-42・D-70）
  const {
    reading,
    items: receiptItems,
    drafts: receiptDrafts,
  } = useSyncExternalStore(receipt.subscribe, receipt.getSnapshot)
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

  // 買い物リストと常備食品。在庫の変更でサーバが自動で載せる（D-73）ので、在庫を変えたあとにも読み直す
  const shoppingSeq = useRef(0)
  const reloadShopping = useCallback(() => {
    const seq = ++shoppingSeq.current
    return Promise.all([shopping.list(), shopping.stocked()])
      .then(([list, names]) => {
        if (seq !== shoppingSeq.current) return
        setShoppingItems(list)
        setStocked(names)
      })
      .catch(() => seq === shoppingSeq.current && setError('買い物リストを読み込めませんでした'))
  }, [shopping])

  // もう一人の変更も反映する。お知らせは出さない（D-72）
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let active = true
    reloadShopping()
    shopping
      .subscribe(() => reloadShopping())
      .then((u) => {
        if (!active) return u()
        unsubscribe = u
        reloadShopping()
      })
      .catch(() => {})
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [shopping, reloadShopping])

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
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      reload()
      reloadShopping()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload, reloadShopping])

  useAutoClear(removed, setRemoved, UNDO_MS)
  useAutoClear(notice, setNotice, NOTICE_MS)

  // 手入力・編集の画面や長押しメニュー、解凍の確認を開いている間は確認画面を開かない（D-70）
  const busy = !!(sheet || menu || thawing)
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(
    () =>
      receipt.onEvent((event) => {
        if (event.kind === 'failed') setError(event.message)
        // 開いている画面を閉じたら確認画面を開くので、ここではお知らせだけ出す
        else if (busyRef.current) setNotice('レシートを読み取りました')
      }),
    [receipt],
  )
  const showReceipt = !!receiptItems && !busy

  /** 編集を保存し、すぐ画面に反映したうえでサーバの最新の状態を読み直す */
  async function save(action: () => Promise<void>) {
    try {
      setError(null)
      await action()
      reload()
      reloadShopping()
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

  /** 「少ない」にした・削除したときに、サーバが買い物リストへ自動で載せる常備食品（D-73） */
  const autoListed = (item: InventoryItem) =>
    autoShoppingNames(item, items ?? [], stocked).filter((n) => !hasUnchecked(shoppingItems, n))

  const toggleQuantity = (item: InventoryItem) =>
    save(async () => {
      setMenu(null)
      const quantity = quantityAfterTap(item.quantity)
      const listed = quantity === 'low' ? autoListed(item) : []
      await repo.updateQuantity(item.id, quantity)
      replace({ ...item, quantity })
      if (listed.length) setNotice(`${listed.join('・')}を買い物リストに入れました`)
    })

  const remove = (item: InventoryItem) =>
    save(async () => {
      const listed = autoListed(item).length > 0
      await repo.remove(item.id)
      setItems((list) => list && list.filter((i) => i.id !== item.id))
      setSheet(null)
      setMenu(null)
      setRemoved({ item, listed })
    })

  const undo = (item: InventoryItem) =>
    save(async () => {
      await repo.restore(item)
      setItems((list) => list && [...list, item])
      setRemoved(null)
    })

  /** 名前を買い物リストに入れ、結果を知らせる（D-74）。入れたら true */
  async function addToShopping(name: string) {
    const { added } = await shopping.add([name])
    setNotice(
      added.length ? `${name}を買い物リストに入れました` : `${name}はもう買い物リストにあります`,
    )
    return added.length > 0
  }

  const shop = (item: InventoryItem) =>
    save(async () => {
      setMenu(null)
      await addToShopping(item.name)
    })

  const shopRemoved = (r: Removed) =>
    save(async () => {
      const { added } = await shopping.add([r.item.name])
      if (!added.length) return setNotice(`${r.item.name}はもう買い物リストにあります`)
      // 自分で入れたので、「元に戻す」をしても消えない（D-74）
      setRemoved((current) => current && { ...current, listed: true })
    })

  const toggleStocked = (item: InventoryItem) =>
    save(async () => {
      setMenu(null)
      const matched = stocked.filter((s) => namesMatch(s, item.name))
      if (matched.length) {
        for (const name of matched) await shopping.removeStocked(name)
        setStocked((list) => list.filter((s) => !matched.includes(s)))
        setNotice(`${matched.join('・')}を常備から外しました`)
      } else {
        await shopping.addStocked(item.name)
        setStocked((list) => [...list, item.name])
        setNotice(`${item.name}を常備にしました`)
      }
    })

  const addShopping = (name: string) =>
    save(async () => {
      await addToShopping(name)
      setSheet(null)
    })

  const toggleChecked = (item: ShoppingItem) =>
    save(async () => {
      setShoppingItems((list) =>
        list.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)),
      )
      await shopping.setChecked(item.id, !item.checked)
    })

  const removeShopping = (item: ShoppingItem) =>
    save(async () => {
      setShoppingItems((list) => list.filter((i) => i.id !== item.id))
      await shopping.remove(item.id)
    })

  const clearChecked = () =>
    save(async () => {
      setShoppingItems((list) => list.filter((i) => !i.checked))
      await shopping.clearChecked()
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

  function readReceipt(photo: File) {
    setError(null)
    receipt.read(photo)
  }

  /** 確認画面の内容を登録する。途中で失敗しても、登録できた分は一覧に出すために読み直す */
  async function registerReceipt({ updates, adds }: ReturnType<typeof receiptChanges>) {
    try {
      for (const item of updates) await repo.update(item)
      for (const item of adds) await repo.add(item)
    } finally {
      reload()
    }
    receipt.clear()
    setNotice(`${updates.length + adds.length} 件を在庫に登録しました`)
  }

  const banner =
    items !== null &&
    showThawBanner({ items, now: now(), today, dismissedOn: bannerDismissedOn, online })

  /** 保存場所の区分 1 つ分の食材の並び */
  const foodGrid = (list: InventoryItem[]) =>
    list.length === 0 ? (
      <p className="empty">食材がありません</p>
    ) : (
      // iPhone のホーム画面のような並び（D-56）。タップで編集、長押しでメニュー
      <ul className="food-grid">
        {list.map((item) => (
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
              onLongPress={(el) => setMenu({ item, anchor: el.getBoundingClientRect() })}
              onClick={() => setSheet({ mode: 'edit', item })}
            >
              <TileFace item={item} today={today} stocked={isStocked(item.name, stocked)} />
            </LongPressButton>
          </li>
        ))}
      </ul>
    )

  return (
    <section className="inventory">
      <div role="tablist" className="segmented">
        {TABS.map(([value, label]) => {
          // 買い物リストはチェックしていない品物の件数を出す（D-72）
          const count = value === 'shopping' ? shoppingItems.filter((i) => !i.checked).length : 0
          return (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              aria-label={count ? `${label}（${count} 件）` : undefined}
              onClick={() => setTab(value)}
            >
              {label}
              {count > 0 && (
                <span className="tab-count" aria-hidden="true">
                  {count}
                </span>
              )}
            </button>
          )
        })}
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

      {/* 食材の並びを横にスワイプして保存場所の切替を移る（D-66） */}
      <SwipePager
        count={TABS.length}
        index={TABS.findIndex(([value]) => value === tab)}
        onChange={(i) => setTab(TABS[i][0])}
        disabled={busy || showReceipt}
        renderPage={(i) => {
          const page = TABS[i][0]
          if (page === 'shopping')
            return (
              <ShoppingList
                items={shoppingItems}
                online={online}
                onToggle={toggleChecked}
                onRemove={removeShopping}
                onClearChecked={clearChecked}
              />
            )
          return items && foodGrid(itemsForTab(items, page))
        }}
      />

      {notice && (
        <div role="status" aria-label="お知らせ" className="toast notice">
          {notice}
        </div>
      )}

      {removed && (
        <div role="status" aria-label="元に戻す" className="toast">
          {removed.item.name} を削除しました{removed.listed && '。買い物リストに入れました'}
          {/* 常備食品で自動で載ったときは出さない（D-74） */}
          {!removed.listed && (
            <button type="button" onClick={() => shopRemoved(removed)}>
              買い物リストへ
            </button>
          )}
          <button type="button" onClick={() => undo(removed.item)}>
            元に戻す
          </button>
        </div>
      )}

      {sheet?.mode === 'add' && (
        <ItemForm
          mode="add"
          catalog={catalog}
          today={today}
          initialLocation={
            tab === 'all' || tab === 'shopping' ? 'fridge' : (tab as StorageLocation)
          }
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
      {sheet?.mode === 'shop' && (
        <ShoppingAddForm
          catalog={catalog.map((e) => e.name)}
          onSubmit={addShopping}
          onCancel={() => setSheet(null)}
        />
      )}
      {menu && (
        <ItemMenu
          item={menu.item}
          today={today}
          anchor={menu.anchor}
          onToggleQuantity={() => toggleQuantity(menu.item)}
          stocked={isStocked(menu.item.name, stocked)}
          onToggleStocked={() => toggleStocked(menu.item)}
          onAddToShopping={() => shop(menu.item)}
          onThaw={online && canThaw(menu.item) ? () => startThaw(menu.item) : undefined}
          onRemove={() => remove(menu.item)}
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
      {showReceipt && items && (
        <ReceiptSheet
          items={receiptItems}
          drafts={receiptDrafts}
          catalog={catalog}
          inventory={items}
          today={today}
          onDraftsChange={(drafts) => receipt.saveDrafts(drafts)}
          onSubmit={registerReceipt}
          onCancel={() => receipt.clear()}
        />
      )}
      {!busy && !showReceipt && tab === 'shopping' && online && (
        // 「買い物」ではヘッダーの＋で品物を入れる。カメラボタンは出さない（D-74）
        <button
          type="button"
          className="header-action"
          aria-label="買い物リストに追加"
          onClick={() => setSheet({ mode: 'shop' })}
        >
          ＋
        </button>
      )}
      {!busy && !showReceipt && tab !== 'shopping' && (
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
            // 読み取り中と確認待ちの間は次を読まない（1 枚ずつ。D-70）
            disabled={reading || !!receiptItems || !online}
            onClick={() => photoInput.current?.click()}
          >
            📷
          </button>
          <button
            type="button"
            className="header-action"
            aria-label="食材を追加"
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
