import { SignInError, type AuthApi, type Session } from './AuthApi'

/** テスト用のインメモリ認証 */
export class FakeAuth implements AuthApi {
  private session: Session | null
  private readonly users: Record<string, string>
  private readonly listeners = new Set<(s: Session | null) => void>()
  private nextFailure: SignInError | null = null

  constructor(opts: { signedInAs?: string; users?: Record<string, string> } = {}) {
    this.session = opts.signedInAs ? { email: opts.signedInAs } : null
    this.users = opts.users ?? {}
  }

  async getSession() {
    return this.session
  }

  onSessionChange(listener: (s: Session | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 次のログインを指定の理由で失敗させる（パスワード違い以外の失敗の再現用） */
  failNextSignIn(error: SignInError) {
    this.nextFailure = error
  }

  async signIn(email: string, password: string) {
    const failure = this.nextFailure
    this.nextFailure = null
    if (failure) throw failure
    if (this.users[email] !== password)
      throw new SignInError('invalid_credentials', 'Invalid login credentials')
    this.setSession({ email })
  }

  async signOut() {
    this.setSession(null)
  }

  private setSession(session: Session | null) {
    this.session = session
    this.listeners.forEach((l) => l(session))
  }
}
