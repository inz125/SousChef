import type { SupabaseClient } from '@supabase/supabase-js'
import { MOCK_RECEIPT, mockRequests, setMockScenario } from '../support/mockClaude'
import { nodeReadReceiptHandler } from '../support/readReceipt'
import { adminClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

const photo = { image: 'AAAA', mediaType: 'image/jpeg' }

async function invokeWithToken(token: string, handler = nodeReadReceiptHandler()) {
  const res = await handler(
    new Request('http://localhost/functions/v1/read-receipt', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(photo),
    }),
  )
  return { status: res.status, body: await res.json() }
}

async function invoke(client: SupabaseClient, handler?: ReturnType<typeof nodeReadReceiptHandler>) {
  const { data } = await client.auth.getSession()
  return invokeWithToken(data.session!.access_token, handler)
}

describe('read-receipt（処理本体 + テスト用 DB + モックの Claude）', () => {
  let client: SupabaseClient

  beforeAll(async () => {
    const email = uniqueEmail('receipt')
    await createUser(email, { allowed: true })
    client = await signedInClient(email)
  })

  afterEach(() => setMockScenario('ok'))

  it('写真を Sonnet 5.5 に画像として渡し、読み取った食材を返す', async () => {
    const { status, body } = await invoke(client)

    expect(status).toBe(200)
    expect(body.items).toEqual(MOCK_RECEIPT.items)
    const sent = (await mockRequests()).at(-1)!
    expect(sent.model).toBe('claude-sonnet-5-5')
    expect(sent.messages[0].content).toMatchObject([
      { type: 'image', source: { data: photo.image } },
      { type: 'text' },
    ])
  })

  it('献立とは別の種類（receipt）で利用回数を数え、上限を超えたら 429', async () => {
    const email = uniqueEmail('receipt-quota')
    await createUser(email, { allowed: true })
    const limited = await signedInClient(email)
    // 回数は世帯で共有するので、今日すでに使った分の次の 1 回だけ使える上限にする
    const before = await receiptCount()
    const handler = nodeReadReceiptHandler(before + 1)

    expect((await invoke(limited, handler)).status).toBe(200)
    expect((await receiptCount()) - before).toBe(1)
    const second = await invoke(limited, handler)
    expect(second.status).toBe(429)
    expect(second.body.error).toMatch(/今日のレシート読み取り回数の上限/)
  })

  it('Claude に断られたら 422', async () => {
    await setMockScenario('refusal')
    const { status, body } = await invoke(client)
    expect(status).toBe(422)
    expect(body.error).toMatch(/撮り直して/)
  })

  it('Claude が失敗したら 502', async () => {
    await setMockScenario('error')
    expect((await invoke(client)).status).toBe(502)
  })

  it('許可リストにないユーザーは 403', async () => {
    const stranger = uniqueEmail('receipt-stranger')
    await createUser(stranger, { allowed: false })
    expect((await invoke(await signedInClient(stranger))).status).toBe(403)
  })

  it('未ログイン（公開用の anon キーだけ）は 403', async () => {
    const { status, body } = await invokeWithToken(env().anonKey)
    expect(status).toBe(403)
    expect(body.error).toMatch(/このアカウントでは使えません/)
  })
})

async function receiptCount() {
  const { data } = await adminClient()
    .from('ai_usage')
    .select('count')
    .eq('kind', 'receipt')
    .order('day', { ascending: false })
    .limit(1)
  return data?.[0]?.count ?? 0
}
