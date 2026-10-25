import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSettingsRepository } from '../../src/settings/supabaseSettingsRepository'
import { anonClient, createUser, signedInClient, uniqueEmail } from '../support/supabase'

describe('createSupabaseSettingsRepository', () => {
  let wifeEmail: string
  let husbandEmail: string
  let wife: SupabaseClient
  let husband: SupabaseClient

  beforeAll(async () => {
    wifeEmail = uniqueEmail('wife')
    husbandEmail = uniqueEmail('husband')
    await createUser(wifeEmail, { allowed: true, displayName: 'はな' })
    await createUser(husbandEmail, { allowed: true, displayName: 'けん' })
    wife = await signedInClient(wifeEmail)
    husband = await signedInClient(husbandEmail)
  })

  it('メンバー一覧を表示名つきで取得でき、未設定の好みは空', async () => {
    const members = await createSupabaseSettingsRepository(wife).members()
    expect(members).toContainEqual({
      email: husbandEmail,
      displayName: 'けん',
      dislikes: [],
      allergies: [],
    })
  })

  it('苦手・アレルギーを保存すると、もう一人からも見える', async () => {
    await createSupabaseSettingsRepository(wife).savePreferences(wifeEmail, {
      dislikes: ['セロリ'],
      allergies: ['えび'],
    })
    await createSupabaseSettingsRepository(wife).savePreferences(wifeEmail, {
      dislikes: ['セロリ', 'パクチー'],
      allergies: ['えび'],
    })
    const members = await createSupabaseSettingsRepository(husband).members()
    expect(members.find((m) => m.email === wifeEmail)).toEqual({
      email: wifeEmail,
      displayName: 'はな',
      dislikes: ['セロリ', 'パクチー'],
      allergies: ['えび'],
    })
  })

  it('常備調味料は未設定なら既定値、保存すると共有される', async () => {
    const repo = createSupabaseSettingsRepository(wife)
    const before = await repo.staples()
    expect(before).toEqual(expect.arrayContaining(['醤油']))
    await repo.saveStaples([...before, 'オイスターソース'])
    expect(await createSupabaseSettingsRepository(husband).staples()).toContain('オイスターソース')
    await repo.saveStaples(before)
  })

  it('許可リストにないユーザー・未ログインはメンバーも設定も見られず、保存もできない', async () => {
    const strangerEmail = uniqueEmail('stranger')
    await createUser(strangerEmail, { allowed: false })
    const stranger = createSupabaseSettingsRepository(await signedInClient(strangerEmail))
    expect(await stranger.members()).toEqual([])
    await expect(
      stranger.savePreferences(wifeEmail, { dislikes: ['いたずら'], allergies: [] }),
    ).rejects.toThrow(/row-level security/i)
    await expect(stranger.saveStaples(['いたずら'])).rejects.toThrow()

    const anon = createSupabaseSettingsRepository(anonClient())
    expect(await anon.members()).toEqual([])
  })
})
