import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useOnline } from './lib/useOnline'
import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'
import { toIsoDate } from './domain/expiry'
import type { InventoryRepository } from './inventory/InventoryRepository'
import type { KeyValueStore } from './offline/offlineCache'
import { InventoryScreen } from './inventory/InventoryScreen'
import type { MealsApi } from './meals/MealsApi'
import type { ReceiptApi } from './receipt/ReceiptApi'
import { ReceiptReader, type ReceiptEvent } from './receipt/receiptReader'
import { MealPlanner } from './meals/mealPlanner'
import { MealsScreen } from './meals/MealsScreen'
import type { RecipesRepository } from './recipes/RecipesRepository'
import { RecipesScreen } from './recipes/RecipesScreen'
import type { SettingsRepository } from './settings/SettingsRepository'
import type { ShoppingRepository } from './shopping/ShoppingRepository'
import { SettingsScreen } from './settings/SettingsScreen'
import { TabIcon, type TabIconName } from './TabIcon'
import type { AppUpdater } from './update/AppUpdater'
import { useAppUpdate } from './update/useAppUpdate'

type Props = {
  auth: AuthApi
  inventory: InventoryRepository
  settings: SettingsRepository
  meals: MealsApi
  receipt: ReceiptApi
  recipes: RecipesRepository
  /** 買い物リストと常備食品（D-71〜D-74） */
  shopping: ShoppingRepository
  /** 端末に残す内容の保存先（D-43） */
  store: KeyValueStore
  /** 新しいバージョンの確認と反映（D-52） */
  updater: AppUpdater
  now: () => Date
}

/** 下部タブ（D-22）。アイコンは D-55。URL のハッシュで切り替える */
const TABS = [
  { hash: '#/', label: '在庫', icon: 'inventory' },
  { hash: '#/meals', label: '献立', icon: 'meals' },
  { hash: '#/recipes', label: 'レシピ', icon: 'recipes' },
  { hash: '#/settings', label: '設定', icon: 'settings' },
] as const satisfies readonly { hash: string; label: string; icon: TabIconName }[]

type TabHash = (typeof TABS)[number]['hash']

function App({
  auth,
  inventory,
  settings,
  meals,
  receipt,
  recipes,
  shopping,
  store,
  updater,
  now,
}: Props) {
  const today = useToday(now)
  const tab = useTab()
  const online = useOnline()
  const update = useAppUpdate(updater)
  // タブを移ってもレシピ作りを続けるよう、提案はアプリで 1 つ持つ（D-63）
  const [planner] = useState(() => new MealPlanner(meals, store))
  // タブを移ってもレシートの読み取りと確認の途中を続けるよう、アプリで 1 つ持つ（D-70）
  const [reader] = useState(() => new ReceiptReader(receipt))
  const receiptPending = useSyncExternalStore(reader.subscribe, reader.getSnapshot).items !== null
  const receiptToast = useReceiptToast(reader, tab !== '#/')
  // 在庫の期限が近い食材の帯から献立タブへ渡す、使いたい食材（D-76）。献立タブが受け取ったら消す
  const [mealStart, setMealStart] = useState<{ mustUse: string[] } | null>(null)
  const planMeals = useCallback((mustUse: string[]) => {
    setMealStart({ mustUse })
    window.location.hash = '#/meals'
  }, [])
  const clearMealStart = useCallback(() => setMealStart(null), [])
  return (
    <AuthGate auth={auth}>
      {(session) => (
        <>
          <header className="app-header">
            <h1>{TABS.find((t) => t.hash === tab)?.label}</h1>
            {!online && (
              <p role="status" aria-label="接続状態" className="offline-banner">
                オフラインです。最後に同期した内容を表示しています（編集・提案はできません）
              </p>
            )}
          </header>
          {update.prompt && (
            <div className="alert-backdrop">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-label="新しいバージョン"
                aria-describedby="update-message"
                className="alert"
              >
                <p id="update-message">新しいバージョンがあります</p>
                <div className="alert-actions">
                  <button type="button" onClick={update.later}>
                    あとで
                  </button>
                  <button type="button" className="primary" onClick={update.apply}>
                    更新
                  </button>
                </div>
              </div>
            </div>
          )}
          <main>
            {tab === '#/' && (
              <InventoryScreen
                repo={inventory}
                shopping={shopping}
                receipt={reader}
                today={today}
                me={session.email}
                now={now}
                store={store}
                onPlanMeals={planMeals}
              />
            )}
            {tab === '#/meals' && (
              <MealsScreen
                planner={planner}
                inventory={inventory}
                recipes={recipes}
                shopping={shopping}
                today={today}
                start={mealStart}
                onStarted={clearMealStart}
              />
            )}
            {tab === '#/recipes' && (
              <RecipesScreen
                repo={recipes}
                inventory={inventory}
                shopping={shopping}
                today={today}
              />
            )}
            {tab === '#/settings' && (
              <SettingsScreen
                repo={settings}
                shopping={shopping}
                inventory={inventory}
                me={session.email}
                onSignOut={() => {
                  reader.reset()
                  return auth.signOut()
                }}
              />
            )}
          </main>
          {receiptToast?.kind === 'read' && (
            <div role="status" aria-label="レシートの読み取り" className="toast">
              レシートを読み取りました
            </div>
          )}
          {receiptToast?.kind === 'failed' && (
            <div role="alert" className="toast">
              {receiptToast.message}
            </div>
          )}
          <nav className="tab-bar">
            {TABS.map((t) => {
              // 確認待ちのレシートがあれば、在庫タブのアイコンに印を付ける（D-70）
              const badge = t.hash === '#/' && receiptPending && tab !== '#/'
              return (
                <a
                  key={t.hash}
                  href={t.hash}
                  aria-current={tab === t.hash ? 'page' : undefined}
                  aria-label={badge ? `${t.label}（確認待ちのレシートあり）` : undefined}
                >
                  <span className="tab-icon">
                    <TabIcon name={t.icon} filled={tab === t.hash} />
                    {badge && <span className="tab-badge" aria-hidden="true" />}
                  </span>
                  <span>{t.label}</span>
                </a>
              )
            })}
          </nav>
        </>
      )}
    </AuthGate>
  )
}

const RECEIPT_TOAST_MS = 4000

/** 在庫画面の外にいる間に読み取りが終わったら、今の画面の下で知らせる（D-70） */
function useReceiptToast(reader: ReceiptReader, away: boolean) {
  const [toast, setToast] = useState<ReceiptEvent | null>(null)
  useEffect(() => {
    if (!away) return
    return reader.onEvent(setToast)
  }, [reader, away])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), RECEIPT_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])
  return toast
}

function currentTab(): TabHash {
  return TABS.find((t) => t.hash === window.location.hash)?.hash ?? '#/'
}

function useTab() {
  const [tab, setTab] = useState(currentTab)
  useEffect(() => {
    const onChange = () => setTab(currentTab())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return tab
}

/** 端末の「今日」。PWA は開いたまま日をまたぐので、前面に戻るたびに取り直す */
function useToday(now: () => Date) {
  const [today, setToday] = useState(() => toIsoDate(now()))
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && setToday(toIsoDate(now()))
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [now])
  return today
}

export default App
