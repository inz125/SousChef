import type { AuthApi } from './auth/AuthApi'
import { AuthGate } from './auth/AuthGate'

function App({ auth }: { auth: AuthApi }) {
  return (
    <AuthGate auth={auth}>
      <main>
        <p>在庫画面は準備中です</p>
      </main>
    </AuthGate>
  )
}

export default App
