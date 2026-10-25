import { useEffect, useState } from 'react'
import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'
import { toIsoDate } from './domain/expiry'
import type { InventoryRepository } from './inventory/InventoryRepository'
import { InventoryScreen } from './inventory/InventoryScreen'

type Props = { auth: AuthApi; inventory: InventoryRepository; now: () => Date }

function App({ auth, inventory, now }: Props) {
  const today = useToday(now)
  return (
    <AuthGate auth={auth}>
      {(session) => (
        <main>
          <InventoryScreen repo={inventory} today={today} me={session.email} />
        </main>
      )}
    </AuthGate>
  )
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
