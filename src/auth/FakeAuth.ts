import type { AuthApi, Session } from './AuthApi'

/** テスト用のインメモリ認証 */
export class FakeAuth implements AuthApi {
  static readonly VALID_CODE = '123456'

  readonly sentTo: string[] = []
  private session: Session | null
  private readonly registeredEmails: string[] | null
  private readonly listeners = new Set<(s: Session | null) => void>()

  constructor(opts: { signedInAs?: string; registeredEmails?: string[] } = {}) {
    this.session = opts.signedInAs ? { email: opts.signedInAs } : null
    this.registeredEmails = opts.registeredEmails ?? null
  }

  async getSession() {
    return this.session
  }

  onSessionChange(listener: (s: Session | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async sendCode(email: string) {
    if (this.registeredEmails && !this.registeredEmails.includes(email)) {
      throw new Error('Signups not allowed for otp')
    }
    this.sentTo.push(email)
  }

  async verifyCode(email: string, code: string) {
    if (!this.sentTo.includes(email) || code !== FakeAuth.VALID_CODE) {
      throw new Error('Token has expired or is invalid')
    }
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
