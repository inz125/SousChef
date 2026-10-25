import { DEFAULT_STAPLES, type MemberPreferences } from '../domain/preferences'
import type { PreferencesInput, SettingsRepository } from './SettingsRepository'

/** テスト用のインメモリ設定 */
export class FakeSettingsRepository implements SettingsRepository {
  memberList: MemberPreferences[]
  stapleList: string[] = [...DEFAULT_STAPLES]
  failSave = false

  constructor(members: MemberPreferences[] = []) {
    this.memberList = members.map((m) => ({ ...m }))
  }

  async members() {
    return this.memberList.map((m) => ({ ...m }))
  }

  async savePreferences(email: string, preferences: PreferencesInput) {
    if (this.failSave) throw new Error('network error')
    this.memberList = this.memberList.map((m) => (m.email === email ? { ...m, ...preferences } : m))
  }

  async staples() {
    return [...this.stapleList]
  }

  async saveStaples(staples: string[]) {
    if (this.failSave) throw new Error('network error')
    this.stapleList = [...staples]
  }
}
