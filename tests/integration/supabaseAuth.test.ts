import { createSupabaseAuth } from '../../src/auth/supabaseAuth'
import { anonClient, createUser, latestLoginCode, uniqueEmail } from '../support/supabase'

describe('createSupabaseAuth', () => {
  it('登録済みのメールアドレスにコードを送り、そのコードでログインできる', async () => {
    const email = uniqueEmail('login')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    const sessions: unknown[] = []
    auth.onSessionChange((s) => sessions.push(s))

    await auth.sendCode(email)
    await auth.verifyCode(email, await latestLoginCode(email))

    expect(await auth.getSession()).toEqual({ email })
    expect(sessions).toContainEqual({ email })
  })

  it('未登録のメールアドレスにはコードを送れない', async () => {
    const auth = createSupabaseAuth(anonClient())
    await expect(auth.sendCode(uniqueEmail('unknown'))).rejects.toThrow(/signups not allowed/i)
  })

  it('誤ったコードではログインできない', async () => {
    const email = uniqueEmail('wrong')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    await auth.sendCode(email)
    await expect(auth.verifyCode(email, '000000')).rejects.toThrow(/expired or is invalid/i)
    expect(await auth.getSession()).toBeNull()
  })

  it('ログアウトするとセッションがなくなる', async () => {
    const email = uniqueEmail('logout')
    await createUser(email, { allowed: true })
    const auth = createSupabaseAuth(anonClient())
    await auth.sendCode(email)
    await auth.verifyCode(email, await latestLoginCode(email))
    await auth.signOut()
    expect(await auth.getSession()).toBeNull()
  })
})
