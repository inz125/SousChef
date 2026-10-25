import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'
import type { IsoDate } from './domain/food'
import type { InventoryRepository } from './inventory/InventoryRepository'
import { InventoryScreen } from './inventory/InventoryScreen'

type Props = { auth: AuthApi; inventory: InventoryRepository; today: IsoDate }

function App({ auth, inventory, today }: Props) {
  return (
    <AuthGate auth={auth}>
      <main>
        <InventoryScreen repo={inventory} today={today} />
      </main>
    </AuthGate>
  )
}

export default App
