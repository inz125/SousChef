import { FunctionsHttpError } from '@supabase/supabase-js'
import { anonClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

/**
 * Edge Runtime（Deno）で実際に関数が起動して応答するかのスモークテスト。
 * Edge Runtime は起動時に npm からパッケージを取得するため、TLS を中継するプロキシの内側
 * （クラウドの開発環境など）では動かない。CI では EDGE_FUNCTIONS=1 で必ず実行する
 */
describe.runIf(process.env.EDGE_FUNCTIONS === '1')('suggest-meals on Edge Runtime', () => {
  it('ログインした許可メンバーに献立を返す', async () => {
    const email = uniqueEmail('edge')
    await createUser(email, { allowed: true })
    const client = await signedInClient(email)
    const { data, error } = await client.functions.invoke('suggest-meals', {
      body: { maxMinutes: null, allowShopping: true, mood: '', mustUse: [] },
    })
    expect(error).toBeNull()
    expect(data.suggestions.length).toBeGreaterThan(0)
  })

  it('認証ヘッダがなければゲートウェイが 401 を返す', async () => {
    const res = await fetch(`${env().url}/functions/v1/suggest-meals`, {
      method: 'POST',
      body: JSON.stringify({ maxMinutes: null, allowShopping: true, mood: '', mustUse: [] }),
    })
    expect(res.status).toBe(401)
  })

  it('未ログイン（anon キーのみ）は 403', async () => {
    const { error } = await anonClient().functions.invoke('suggest-meals', {
      body: { maxMinutes: null, allowShopping: true, mood: '', mustUse: [] },
    })
    expect(error).toBeInstanceOf(FunctionsHttpError)
    expect(((error as FunctionsHttpError).context as Response).status).toBe(403)
  })
})
