import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import type { AuthApi, Session } from './AuthApi'

const toSession = (s: SupabaseSession | null): Session | null =>
  s?.user.email ? { email: s.user.email } : null

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
    async sendCode(email) {
      // サインアップは無効（D-16）。事前登録済みのユーザーにだけ送る
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) throw error
    },
    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw error
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw error
    },
  }
}
