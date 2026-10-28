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
import { MealsScreen } from './meals/MealsScreen'
import type { RecipesRepository } from './recipes/RecipesRepository'
import { RecipesScreen } from './recipes/RecipesScreen'
import type { SettingsRepository } from './settings/SettingsRepository'
import { SettingsScreen } from './settings/SettingsScreen'
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

/** 下部タブ（D-22）。URL のハッシュで切り替える */
const TABS = [
  { hash: '#/', label: '在庫' },
  { hash: '#/meals', label: '献立' },
  { hash: '#/recipes', label: 'レシピ' },
  { hash: '#/settings', label: '設定' },
] as const

type TabHash = (typeof TABS)[number]['hash']

function App({ auth, inventory, settings, meals, receipt, recipes, store, updater, now }: Props) {
  const today = useToday(now)
  const tab = useTab()
  const online = useOnline()
  const update = useAppUpdate(updater)
  return (
    <AuthGate auth={auth}>
      {(session) => (
        <>
          {update.needRefresh && (
            <div role="status" aria-label="更新" className="update-banner">
              <span>新しいバージョンがあります</span>
              <button type="button" onClick={update.apply}>
                更新
              </button>
            </div>
          )}
          {!online && (
            <p role="status" aria-label="接続状態" className="offline-banner">
              オフラインです。最後に同期した内容を表示しています（編集・提案はできません）
            </p>
          )}
          <header className="app-header">
            <h1>{TABS.find((t) => t.hash === tab)?.label}</h1>
          </header>
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
                api={meals}
                inventory={inventory}
                recipes={recipes}
                store={store}
                today={today}
              />
            )}
            {tab === '#/recipes' && (
              <RecipesScreen repo={recipes} inventory={inventory} today={today} />
            )}
            {tab === '#/settings' && (
              <SettingsScreen repo={settings} me={session.email} onSignOut={() => auth.signOut()} />
            )}
          </main>
          <nav className="tab-bar">
            {TABS.map((t) => (
              <a key={t.hash} href={t.hash} aria-current={tab === t.hash ? 'page' : undefined}>
                {t.label}
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
