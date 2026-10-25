export type Session = { email: string }

/** 認証の境界。本番は Supabase、テストは FakeAuth を差し込む */
export interface AuthApi {
  getSession(): Promise<Session | null>
  onSessionChange(listener: (session: Session | null) => void): () => void
  /** メールアドレスとパスワードでログインする（D-15）。違っていれば失敗する */
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}
