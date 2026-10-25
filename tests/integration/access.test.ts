import {
  adminClient,
  anonClient,
  createUser,
  signedInClient,
  uniqueEmail,
} from '../support/supabase'

const item = (name: string) => ({
  name,
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expires_on: '2026-10-28',
  expires_on_estimated: true,
})

describe('アクセス制限（D-16）', () => {
  let husband: string
  let wife: string
  let stranger: string

  beforeAll(async () => {
    husband = uniqueEmail('husband')
    wife = uniqueEmail('wife')
    stranger = uniqueEmail('stranger')
    await createUser(husband, { allowed: true })
    await createUser(wife, { allowed: true })
    await createUser(stranger, { allowed: false })
  })

  it('許可されたメンバーが追加した在庫を、もう一人のメンバーも見られる', async () => {
    const name = `豚バラ肉-${crypto.randomUUID()}`
    const h = await signedInClient(husband)
    const { error } = await h.from('inventory_items').insert(item(name))
    expect(error).toBeNull()

    const w = await signedInClient(wife)
    const { data } = await w.from('inventory_items').select('name').eq('name', name)
    expect(data).toEqual([{ name }])
  })

  it('許可リストにないユーザーは在庫を読めない', async () => {
    const name = `鶏もも肉-${crypto.randomUUID()}`
    await (await signedInClient(husband)).from('inventory_items').insert(item(name))

    const s = await signedInClient(stranger)
    const { data } = await s.from('inventory_items').select('name').eq('name', name)
    expect(data).toEqual([])
  })

  it('許可リストにないユーザーは在庫を追加できない', async () => {
    const s = await signedInClient(stranger)
    const { error } = await s.from('inventory_items').insert(item('不正な追加'))
    expect(error).not.toBeNull()
  })

  it('未ログインでは在庫を読めない', async () => {
    const name = `卵-${crypto.randomUUID()}`
    await (await signedInClient(husband)).from('inventory_items').insert(item(name))

    const { data } = await anonClient().from('inventory_items').select('name').eq('name', name)
    expect(data ?? []).toEqual([])
  })

  it('ログインしたユーザーでも自分を許可リストに追加できない', async () => {
    const s = await signedInClient(stranger)
    const { error } = await s.from('allowed_members').insert({ email: stranger })
    expect(error).not.toBeNull()
    const { count } = await adminClient()
      .from('allowed_members')
      .select('*', { count: 'exact', head: true })
      .eq('email', stranger)
    expect(count).toBe(0)
  })

  it('自分でアカウントを作ることはできない（パスワード・メールのどちらでも）', async () => {
    const signUp = await anonClient().auth.signUp({
      email: uniqueEmail('new'),
      password: 'some-password-1234',
    })
    expect(signUp.error?.message).toMatch(/signups not allowed/i)
    const otp = await anonClient().auth.signInWithOtp({ email: uniqueEmail('new') })
    expect(otp.error?.message).toMatch(/signups not allowed/i)
  })

  it('メールアドレスの大文字小文字は区別しない', async () => {
    const mixed = uniqueEmail('Mixed-Case')
    await createUser(mixed.toLowerCase(), { allowed: false })
    await adminClient().from('allowed_members').insert({ email: mixed })
    const c = await signedInClient(mixed.toLowerCase())
    const { error } = await c.from('inventory_items').insert(item(`大文字-${crypto.randomUUID()}`))
    expect(error).toBeNull()
  })
})
