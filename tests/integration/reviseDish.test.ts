import {
  MOCK_MEAL_PLAN,
  MOCK_REVISED_DISH,
  mockRequests,
  setMockScenario,
} from '../support/mockClaude'
import { nodeReviseDishHandler } from '../support/reviseDish'
import { adminClient, createUser, env, signedInClient, uniqueEmail } from '../support/supabase'

const body = {
  course: 'main',
  dish: MOCK_MEAL_PLAN.suggestions[0].main,
  instruction: '鶏肉を半分にして全体を調整して',
  microwave: false,
}

async function invokeWithToken(token: string) {
  const res = await nodeReviseDishHandler()(
    new Request('http://localhost/functions/v1/revise-dish', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

async function tokenOf(email: string) {
  const { data } = await (await signedInClient(email)).auth.getSession()
  return data.session!.access_token
}

const tokyoToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

const mealUsage = async () => {
  const { data } = await adminClient()
    .from('ai_usage')
    .select('count')
    .eq('kind', 'meal')
    .eq('day', tokyoToday())
    .maybeSingle()
  return data?.count ?? 0
}

describe('revise-dish（処理本体 + テスト用 DB + モックの Claude, D-64）', () => {
  afterEach(() => setMockScenario('ok'))

  it('頼み方に合わせて直した料理を返し、提案の回数を 1 回使う', async () => {
    const email = uniqueEmail('revise')
    await createUser(email, { allowed: true })
    const before = await mealUsage()

    const { status, body: reply } = await invokeWithToken(await tokenOf(email))

    expect(status).toBe(200)
    expect(reply.dish).toEqual(MOCK_REVISED_DISH)
    expect(await mealUsage()).toBe(before + 1)
    const prompt = String((await mockRequests()).at(-1)!.messages[0].content)
    expect(prompt).toMatch(/- 鶏もも肉 1 枚（300g）（在庫）/)
    expect(prompt).toMatch(/<request>\n鶏肉を半分にして全体を調整して\n<\/request>/)
  })

  it('Claude が失敗したら 502 でも、回数は 1 回使う（提案と同じ数え方）', async () => {
    const email = uniqueEmail('revise-failed')
    await createUser(email, { allowed: true })
    const before = await mealUsage()
    await setMockScenario('error')
    const { status, body: reply } = await invokeWithToken(await tokenOf(email))
    expect(status).toBe(502)
    expect(reply.error).toBe('修正できませんでした。もう一度お試しください')
    expect(await mealUsage()).toBe(before + 1)
  })

  it('許可リストにないユーザーは 403', async () => {
    const stranger = uniqueEmail('revise-stranger')
    await createUser(stranger, { allowed: false })
    const { status, body: reply } = await invokeWithToken(await tokenOf(stranger))
    expect(status).toBe(403)
    expect(reply.error).toMatch(/このアカウントでは使えません/)
  })

  it('未ログイン（公開用の anon キーだけ）は 403', async () => {
    const { status, body: reply } = await invokeWithToken(env().anonKey)
    expect(status).toBe(403)
    expect(reply.error).toMatch(/このアカウントでは使えません/)
  })
})
