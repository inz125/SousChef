import { createSupabaseMealsApi } from '../../src/meals/supabaseMealsApi'
import { createSupabaseReceiptApi } from '../../src/receipt/supabaseReceiptApi'
import { anonClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

const conditions = {
  maxMinutes: null,
  allowShopping: true,
  soup: true,
  sideMicrowave: false,
  mood: '',
  mustUse: [],
}

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

  it('read-receipt: 画面側のアダプタから写真を送ると、読み取った食材を返す', async () => {
    const email = uniqueEmail('edge-receipt')
    await createUser(email, { allowed: true })
    const api = createSupabaseReceiptApi(await signedInClient(email), async () => ({
      image: 'AAAA',
      mediaType: 'image/jpeg',
    }))
    const items = await api.read(new File(['x'], 'r.jpg'))
    expect(items.length).toBeGreaterThan(0)
  })

  it('read-receipt: 未ログイン（anon キーのみ）は、サーバの理由つきのエラーになる', async () => {
    const api = createSupabaseReceiptApi(anonClient(), async () => ({
      image: 'AAAA',
      mediaType: 'image/jpeg',
    }))
    await expect(api.read(new File(['x'], 'r.jpg'))).rejects.toThrow(/このアカウントでは使えません/)
  })
})
