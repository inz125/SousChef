import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { SignInError, type AuthApi, type Session } from './AuthApi'

type Props = { auth: AuthApi; children: (session: Session) => ReactNode }

export function AuthGate({ auth, children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    auth.getSession().then((s) => active && setSession(s))
    const unsubscribe = auth.onSessionChange(setSession)
    return () => {
      active = false
      unsubscribe()
    }
  }, [auth])

  if (session === undefined) return null
  if (session === null) return <LoginScreen auth={auth} />

  return (
    <>
      <header className="app-header">
        <h1>SousChef</h1>
        <button type="button" onClick={() => auth.signOut()}>
          ログアウト
        </button>
      </header>
      {children(session)}
    </>
  )
}

function signInErrorMessage(e: unknown): string {
  const reason = e instanceof SignInError ? e.reason : 'unknown'
  switch (reason) {
    case 'invalid_credentials':
      return 'メールアドレスかパスワードが違います'
    case 'email_not_confirmed':
      return 'このユーザーはまだ確認されていません。Supabase の Users で確認済みにしてください'
    case 'network':
      return 'サーバーにつながりません。電波の状態を確かめてください'
    case 'unknown':
      return `ログインできませんでした（${e instanceof Error ? e.message : String(e)}）`
  }
}

function LoginScreen({ auth }: { auth: AuthApi }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await auth.signIn(email.trim(), password)
    } catch (e) {
      setPassword('')
      setError(signInErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // 入力し直したら前のエラーは消す
  const edit = (set: (v: string) => void) => (value: string) => {
    setError(null)
    set(value)
  }

  return (
    <main className="login">
      <h1>SousChef</h1>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => edit(setEmail)(e.target.value)}
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => edit(setPassword)(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          ログイン
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
