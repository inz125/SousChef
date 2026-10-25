import { useEffect, useState } from 'react'
import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'
import { toIsoDate } from './domain/expiry'
import type { InventoryRepository } from './inventory/InventoryRepository'
import { InventoryScreen } from './inventory/InventoryScreen'
import type { MealsApi } from './meals/MealsApi'
import { MealsScreen } from './meals/MealsScreen'
import type { RecipesRepository } from './recipes/RecipesRepository'
import { RecipesScreen } from './recipes/RecipesScreen'
import type { SettingsRepository } from './settings/SettingsRepository'
import { SettingsScreen } from './settings/SettingsScreen'

type Props = {
  auth: AuthApi
  inventory: InventoryRepository
  settings: SettingsRepository
  meals: MealsApi
  recipes: RecipesRepository
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

function App({ auth, inventory, settings, meals, recipes, now }: Props) {
  const today = useToday(now)
  const tab = useTab()
  return (
    <AuthGate auth={auth}>
      {(session) => (
        <>
          <main>
            {tab === '#/' && <InventoryScreen repo={inventory} today={today} me={session.email} />}
            {tab === '#/meals' && (
              <MealsScreen api={meals} inventory={inventory} recipes={recipes} today={today} />
            )}
            {tab === '#/recipes' && (
              <RecipesScreen repo={recipes} inventory={inventory} today={today} />
            )}
            {tab === '#/settings' && <SettingsScreen repo={settings} me={session.email} />}
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
