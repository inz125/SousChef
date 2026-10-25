export type Session = { email: string }

/** 認証の境界。本番は Supabase、テストは FakeAuth を差し込む */
export interface AuthApi {
  getSession(): Promise<Session | null>
  onSessionChange(listener: (session: Session | null) => void): () => void
  /** ログインコードをメールで送る。未登録のメールアドレスなら失敗する */
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}
