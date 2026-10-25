import { createClient } from '@supabase/supabase-js'
import { createSupabaseAuth } from '../../src/auth/supabaseAuth'
import { anonClient, createUser, env, TEST_PASSWORD, uniqueEmail } from '../support/supabase'

describe('createSupabaseAuth（D-15: メールアドレスとパスワード）', () => {
  it('登録済みのユーザーはパスワードでログインでき、セッションが通知される', async () => {
    const email = uniqueEmail('login')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    const sessions: unknown[] = []
    auth.onSessionChange((s) => sessions.push(s))

    await auth.signIn(email, TEST_PASSWORD)

    expect(await auth.getSession()).toEqual({ email })
    expect(sessions).toContainEqual({ email })
  })

  it('パスワードが違えばログインできない', async () => {
    const email = uniqueEmail('wrong')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    await expect(auth.signIn(email, 'wrong-password')).rejects.toMatchObject({
      reason: 'invalid_credentials',
    })
    expect(await auth.getSession()).toBeNull()
  })

  it('登録されていないメールアドレスではログインできない', async () => {
    const auth = createSupabaseAuth(anonClient())
    await expect(auth.signIn(uniqueEmail('unknown'), TEST_PASSWORD)).rejects.toMatchObject({
      reason: 'invalid_credentials',
    })
  })

  it('ログアウトするとセッションがなくなる', async () => {
    const email = uniqueEmail('logout')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    await auth.signIn(email, TEST_PASSWORD)
    await auth.signOut()
    expect(await auth.getSession()).toBeNull()
  })

  it('サーバーにつながらなければ network として失敗する', async () => {
    const client = createClient('http://127.0.0.1:1', env().anonKey, {
      auth: { persistSession: false },
    })
    await expect(
      createSupabaseAuth(client).signIn(uniqueEmail('offline'), TEST_PASSWORD),
    ).rejects.toMatchObject({ reason: 'network' })
  })
})
