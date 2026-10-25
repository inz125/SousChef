import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AuthApi, Session } from './AuthApi'

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

function LoginScreen({ auth }: { auth: AuthApi }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, errorMessage: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(errorMessage)
    } finally {
      setBusy(false)
    }
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await auth.sendCode(email.trim())
      setCode('')
      setStep('code')
    }, 'コードを送信できませんでした。登録済みのメールアドレスか確認してください。')
  }

  function submitCode(e: FormEvent) {
    e.preventDefault()
    run(() => auth.verifyCode(email.trim(), code.trim()), 'コードが正しくないか、期限切れです。')
  }

  return (
    <main className="login">
      <h1>SousChef</h1>
      {step === 'email' ? (
        <form onSubmit={submitEmail}>
          <label>
            メールアドレス
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            コードを送信
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <p>{email} に送信しました。メールに記載された 6 桁のコードを入力してください。</p>
          <label>
            ログインコード
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            ログイン
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setStep('email')
            }}
          >
            メールアドレスを変更
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
