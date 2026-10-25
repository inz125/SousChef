// テスト用のモック Claude サーバ。テスト用 Supabase の Edge Function はここを Claude API として呼ぶ
// （scripts/test-db.mjs の ANTHROPIC_BASE_URL）。本物の API は呼ばない
import { createServer } from 'node:http'

export const MOCK_CLAUDE_PORT = 54499
const CONTROL_URL = `http://127.0.0.1:${MOCK_CLAUDE_PORT}`

export type MockScenario = 'ok' | 'refusal' | 'error'

type Source = 'stock' | 'staple' | 'buy'
type Category = 'meat' | 'fish' | 'leafy' | 'root' | 'soy' | 'seasoning'

const dish = (
  name: string,
  minutes: number,
  ingredients: [string, string, Source, Category][],
  steps: string[],
) => ({
  name,
  minutes,
  ingredients: ingredients.map(([n, amount, source, category]) => ({
    name: n,
    amount,
    source,
    category,
  })),
  steps,
})

/** モックが返す献立。2 案目はえびを使う（アレルギー除外の確認用） */
export const MOCK_MEAL_PLAN = {
  suggestions: [
    {
      main: dish(
        '鶏もも肉の照り焼き',
        20,
        [
          ['鶏もも肉', '1 枚（300g）', 'stock', 'meat'],
          ['醤油', '大さじ2', 'staple', 'seasoning'],
          ['みりん', '大さじ2', 'staple', 'seasoning'],
          ['しょうが', '1 かけ', 'buy', 'root'],
        ],
        [
          '鶏肉の皮目をフォークで刺す',
          '皮目から中火で 6 分焼く',
          '裏返して 4 分焼く',
          '調味料を加えて煮からめる',
          '食べやすく切る',
        ],
      ),
      side: dish(
        'キャベツの塩もみ',
        10,
        [
          ['キャベツ', '1/4 個', 'stock', 'leafy'],
          ['塩', '小さじ1/2', 'staple', 'seasoning'],
        ],
        ['キャベツをざく切りにする', '塩を振って揉む', '5 分おいて水気を絞る', '器に盛る', '完成'],
      ),
      totalMinutes: 25,
      usesExpiringSoon: ['鶏もも肉'],
      tip: '鶏肉を焼いている間にキャベツを塩もみしておく',
    },
    {
      main: dish(
        'えびチリ',
        20,
        [
          ['むきえび', '200g', 'buy', 'fish'],
          ['ケチャップ', '大さじ3', 'staple', 'seasoning'],
        ],
        ['えびの背わたを取る', '片栗粉をまぶす', '焼く', 'ソースを作る', 'からめる'],
      ),
      side: dish(
        'わかめスープ',
        5,
        [['乾燥わかめ', '大さじ1', 'buy', 'seasoning']],
        ['湯を沸かす', 'わかめを入れる', '味を調える', '器に盛る', '完成'],
      ),
      totalMinutes: 25,
      usesExpiringSoon: [],
      tip: 'スープを先に作っておく',
    },
    {
      main: dish(
        '豆腐ステーキ',
        15,
        [
          ['豆腐', '1 丁', 'stock', 'soy'],
          ['醤油', '大さじ1', 'staple', 'seasoning'],
        ],
        ['豆腐の水を切る', '片栗粉をまぶす', '両面を焼く', '醤油を回しかける', '器に盛る'],
      ),
      side: dish(
        'キャベツの味噌汁',
        10,
        [
          ['キャベツ', '1/8 個', 'stock', 'leafy'],
          ['味噌', '大さじ2', 'staple', 'seasoning'],
        ],
        ['湯を沸かす', 'キャベツを煮る', '味噌を溶く', '器に盛る', '完成'],
      ),
      totalMinutes: 20,
      usesExpiringSoon: [],
      tip: '味噌汁を煮ている間に豆腐を焼く',
    },
  ],
}

function message(scenario: MockScenario) {
  const refusal = scenario === 'refusal'
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: refusal ? [] : [{ type: 'text', text: JSON.stringify(MOCK_MEAL_PLAN) }],
    stop_reason: refusal ? 'refusal' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 100 },
  }
}

/** モックサーバを起動する（globalSetup から呼ぶ）。終了関数を返す */
export async function startMockClaude(): Promise<() => Promise<void>> {
  let scenario: MockScenario = 'ok'
  const requests: unknown[] = []

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString()
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }

    if (req.url === '/__scenario' && req.method === 'POST') {
      scenario = JSON.parse(body).scenario
      return send(200, { scenario })
    }
    if (req.url === '/__requests') return send(200, requests)
    if (req.url?.startsWith('/v1/messages') && req.method === 'POST') {
      requests.push(JSON.parse(body))
      if (scenario === 'error') {
        return send(500, { type: 'error', error: { type: 'api_error', message: 'mock' } })
      }
      return send(200, message(scenario))
    }
    send(404, { error: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(MOCK_CLAUDE_PORT, '0.0.0.0', resolve))
  return () => new Promise((resolve) => server.close(() => resolve()))
}

/** テストから応答の種類を切り替える */
export async function setMockScenario(scenario: MockScenario) {
  await fetch(`${CONTROL_URL}/__scenario`, { method: 'POST', body: JSON.stringify({ scenario }) })
}

/** モックが受け取ったリクエスト（Claude API に送られた本文） */
export async function mockRequests(): Promise<
  { model: string; messages: { content: string }[] }[]
> {
  return (await fetch(`${CONTROL_URL}/__requests`)).json()
}
