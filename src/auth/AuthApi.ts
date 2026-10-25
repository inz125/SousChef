export type Session = { email: string }

/** ログインに失敗した理由。画面で原因ごとに案内を出し分ける */
export type SignInFailure = 'invalid_credentials' | 'email_not_confirmed' | 'network' | 'unknown'

export class SignInError extends Error {
  readonly reason: SignInFailure

  constructor(reason: SignInFailure, message: string) {
    super(message)
    this.name = 'SignInError'
    this.reason = reason
  }
}

/** 認証の境界。本番は Supabase、テストは FakeAuth を差し込む */
export interface AuthApi {
  getSession(): Promise<Session | null>
  onSessionChange(listener: (session: Session | null) => void): () => void
  /** メールアドレスとパスワードでログインする（D-15）。失敗したら SignInError を投げる */
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}
