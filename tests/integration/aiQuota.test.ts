import { adminClient, createUser, signedInClient, uniqueEmail } from '../support/supabase'

/** テストごとに別の種類名を使い、他のテストの利用回数と混ざらないようにする */
const kind = () => `test-${crypto.randomUUID()}`

describe('consume_ai_quota（D-21）', () => {
  it('上限までは使えて、超えたらエラーになる', async () => {
    const email = uniqueEmail('quota')
    await createUser(email, { allowed: true })
    const client = await signedInClient(email)
    const k = kind()

    for (const expected of [1, 2]) {
      const { data, error } = await client.rpc('consume_ai_quota', { kind: k, daily_limit: 2 })
      expect(error).toBeNull()
      expect(data).toBe(expected)
    }
    const { error } = await client.rpc('consume_ai_quota', { kind: k, daily_limit: 2 })
    expect(error?.message).toMatch(/quota_exceeded/)
  })

  it('回数は世帯で共有する（夫婦どちらが使っても数える）', async () => {
    const a = uniqueEmail('quota-a')
    const b = uniqueEmail('quota-b')
    await createUser(a, { allowed: true })
    await createUser(b, { allowed: true })
    const k = kind()
    await (await signedInClient(a)).rpc('consume_ai_quota', { kind: k, daily_limit: 1 })
    const { error } = await (
      await signedInClient(b)
    ).rpc('consume_ai_quota', {
      kind: k,
      daily_limit: 1,
    })
    expect(error?.message).toMatch(/quota_exceeded/)
  })

  it('日本時間の日付ごとに数える', async () => {
    const email = uniqueEmail('quota-day')
    await createUser(email, { allowed: true })
    const k = kind()
    await (await signedInClient(email)).rpc('consume_ai_quota', { kind: k, daily_limit: 5 })
    const { data } = await adminClient()
      .from('ai_usage')
      .select('day, count')
      .eq('kind', k)
      .single<{ day: string; count: number }>()
    const tokyoToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(
      new Date(),
    )
    expect(data).toEqual({ day: tokyoToday, count: 1 })
  })

  it('許可リストにないユーザーは使えない', async () => {
    const email = uniqueEmail('quota-stranger')
    await createUser(email, { allowed: false })
    const { error } = await (
      await signedInClient(email)
    ).rpc('consume_ai_quota', {
      kind: kind(),
      daily_limit: 5,
    })
    expect(error?.message).toMatch(/not_allowed/)
  })

  it('利用回数のテーブルを直接書き換えられない', async () => {
    const email = uniqueEmail('quota-direct')
    await createUser(email, { allowed: true })
    const { error } = await (
      await signedInClient(email)
    )
      .from('ai_usage')
      .insert({ day: '2026-01-01', kind: 'meal', count: 0 })
    expect(error?.message).toMatch(/row-level security|permission denied/i)
  })
})
