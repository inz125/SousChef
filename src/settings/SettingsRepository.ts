import type { MemberPreferences } from '../domain/preferences'

export type PreferencesInput = Pick<MemberPreferences, 'dislikes' | 'allergies'>

/** 設定の保存先の境界。本番は Supabase、テストは FakeSettingsRepository */
export interface SettingsRepository {
  members(): Promise<MemberPreferences[]>
  savePreferences(email: string, preferences: PreferencesInput): Promise<void>
  /** 常備調味料（初期値は DB のマイグレーションで入る） */
  staples(): Promise<string[]>
  saveStaples(staples: string[]): Promise<void>
}
