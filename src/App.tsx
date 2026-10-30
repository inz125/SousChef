import { useEffect, useState } from 'react'
import { useOnline } from './lib/useOnline'
import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'
import { toIsoDate } from './domain/expiry'
import type { InventoryRepository } from './inventory/InventoryRepository'
import type { KeyValueStore } from './offline/offlineCache'
import { InventoryScreen } from './inventory/InventoryScreen'
import type { MealsApi } from './meals/MealsApi'
import type { ReceiptApi } from './receipt/ReceiptApi'
import { MealPlanner } from './meals/mealPlanner'
import { MealsScreen } from './meals/MealsScreen'
import type { RecipesRepository } from './recipes/RecipesRepository'
import { RecipesScreen } from './recipes/RecipesScreen'
import type { SettingsRepository } from './settings/SettingsRepository'
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

function App({ auth, inventory, settings, meals, receipt, recipes, store, updater, now }: Props) {
  const today = useToday(now)
  const tab = useTab()
  const online = useOnline()
  const update = useAppUpdate(updater)
  // タブを移ってもレシピ作りを続けるよう、提案はアプリで 1 つ持つ（D-63）
  const [planner] = useState(() => new MealPlanner(meals, store))
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
                receipt={receipt}
                today={today}
                me={session.email}
                now={now}
                store={store}
              />
            )}
            {tab === '#/meals' && (
              <MealsScreen
                planner={planner}
                inventory={inventory}
                recipes={recipes}
                today={today}
              />
            )}
            {tab === '#/recipes' && (
              <RecipesScreen repo={recipes} inventory={inventory} today={today} />
            )}
            {tab === '#/settings' && (
              <SettingsScreen
                repo={settings}
                inventory={inventory}
                me={session.email}
                onSignOut={() => auth.signOut()}
              />
            )}
          </main>
          <nav className="tab-bar">
            {TABS.map((t) => (
              <a key={t.hash} href={t.hash} aria-current={tab === t.hash ? 'page' : undefined}>
                <TabIcon name={t.icon} filled={tab === t.hash} />
                <span>{t.label}</span>
              </a>
            ))}
          </nav>
        </>
      )}
    </AuthGate>
  )
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
