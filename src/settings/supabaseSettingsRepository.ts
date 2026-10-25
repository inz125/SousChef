import type { SupabaseClient } from '@supabase/supabase-js'
import type { SettingsRepository } from './SettingsRepository'

type PreferencesRow = { dislikes: string[]; allergies: string[] }

type MemberRow = {
  email: string
  display_name: string | null
  // member_preferences は email が主キーかつ外部キーなので 1 対 1（未設定なら null）
  member_preferences: PreferencesRow | PreferencesRow[] | null
}

export function createSupabaseSettingsRepository(client: SupabaseClient): SettingsRepository {
  return {
    async members() {
      const { data, error } = await client
        .from('allowed_members')
        .select('email, display_name, member_preferences(dislikes, allergies)')
        .returns<MemberRow[]>()
      if (error) throw error
      return data.map((m) => {
        const prefs = Array.isArray(m.member_preferences)
          ? m.member_preferences[0]
          : m.member_preferences
        return {
          email: m.email,
          displayName: m.display_name ?? m.email.split('@')[0],
          dislikes: prefs?.dislikes ?? [],
          allergies: prefs?.allergies ?? [],
        }
      })
    },
    async savePreferences(email, { dislikes, allergies }) {
      const { error } = await client
        .from('member_preferences')
        .upsert({ email, dislikes, allergies, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    async staples() {
      const { data, error } = await client
        .from('household_settings')
        .select('staples')
        .maybeSingle<{ staples: string[] | null }>()
      if (error) throw error
      return data?.staples ?? []
    },
    async saveStaples(staples) {
      const { error } = await client
        .from('household_settings')
        .upsert({ id: 1, staples, updated_at: new Date().toISOString() })
      if (error) throw error
    },
  }
}
