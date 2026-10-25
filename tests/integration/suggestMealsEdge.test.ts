import { createSupabaseMealsApi } from '../../src/meals/supabaseMealsApi'
import { anonClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

const conditions = { maxMinutes: null, allowShopping: true, mood: '', mustUse: [] }

/**
 * Edge Runtime（Deno）で実際に関数が起動して応答するかのスモークテスト。
 * Edge Runtime は起動時に npm からパッケージを取得するため、TLS を中継するプロキシの内側
 * （クラウドの開発環境など）では動かない。CI では EDGE_FUNCTIONS=1 で必ず実行する
 */
describe.runIf(process.env.EDGE_FUNCTIONS === '1')('suggest-meals on Edge Runtime', () => {
  it('画面側のアダプタから呼ぶと、ログインした許可メンバーに献立を返す', async () => {
    const email = uniqueEmail('edge')
    await createUser(email, { allowed: true })
    const api = createSupabaseMealsApi(await signedInClient(email))
    expect((await api.suggest(conditions)).length).toBeGreaterThan(0)
  })

  it('認証ヘッダがなければゲートウェイが 401 を返す', async () => {
    const res = await fetch(`${env().url}/functions/v1/suggest-meals`, {
      method: 'POST',
      body: JSON.stringify(conditions),
    })
    expect(res.status).toBe(401)
  })

  it('未ログイン（anon キーのみ）は、サーバの理由つきのエラーになる', async () => {
    const api = createSupabaseMealsApi(anonClient())
    await expect(api.suggest(conditions)).rejects.toThrow(/このアカウントでは使えません/)
  })
})
