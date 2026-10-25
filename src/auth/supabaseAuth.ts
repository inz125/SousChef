import {
  isAuthApiError,
  isAuthRetryableFetchError,
  type Session as SupabaseSession,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { SignInError, type AuthApi, type Session } from './AuthApi'

const toSession = (s: SupabaseSession | null): Session | null =>
  s?.user.email ? { email: s.user.email } : null

/** Supabase の失敗を理由ごとに分ける。分からないものは元のメッセージを残す */
export function toSignInError(error: unknown): SignInError {
  const message = error instanceof Error ? error.message : String(error)
  if (isAuthApiError(error)) {
    if (error.code === 'invalid_credentials') return new SignInError('invalid_credentials', message)
    if (error.code === 'email_not_confirmed') return new SignInError('email_not_confirmed', message)
  } else if (isAuthRetryableFetchError(error) || error instanceof TypeError) {
    // fetch 自体の失敗（Safari は "Load failed"、Chrome は "Failed to fetch"）
    return new SignInError('network', message)
  }
  return new SignInError('unknown', message)
}

export function createSupabaseAuth(client: SupabaseClient): AuthApi {
  return {
    async getSession() {
      const { data } = await client.auth.getSession()
      return toSession(data.session)
    },
    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, s) => listener(toSession(s)))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      // ユーザーは管理者が事前に登録する（サインアップは無効。D-16）
      const { error } = await client.auth
        .signInWithPassword({ email, password })
        .catch((e: unknown) => ({ error: e }))
      if (error) throw toSignInError(error)
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw error
    },
  }
}
