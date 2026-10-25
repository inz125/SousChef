import type { AuthApi, Session } from './AuthApi'

/** テスト用のインメモリ認証 */
export class FakeAuth implements AuthApi {
  private session: Session | null
  private readonly users: Record<string, string>
  private readonly listeners = new Set<(s: Session | null) => void>()

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

  async signIn(email: string, password: string) {
    if (this.users[email] !== password) throw new Error('Invalid login credentials')
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
