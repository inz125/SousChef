import { expect, type Locator, type Page } from '@playwright/test'
import { nodeReadReceiptHandler } from '../support/readReceipt'
import { nodeSuggestMealsHandler } from '../support/suggestMeals'
import { createUser, TEST_PASSWORD, uniqueEmail } from '../support/supabase'

/** モックの献立の 1 案目（主菜・副菜・汁物）のカード名 */
export const FIRST = '鶏もも肉の照り焼き・キャベツの塩もみ・豆腐とねぎの味噌汁'

/** 許可メンバーを作成し、ログイン画面からログインする */
export async function loginAsNewMember(page: Page, displayName?: string): Promise<string> {
  const email = uniqueEmail('e2e')
  await createUser(email, { allowed: true, displayName })
  await page.goto('/')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '在庫' })).toBeVisible()
  return email
}

/** 在庫の行を左にスワイプして、量の切り替えと「削除」のボタンを出す（D-41） */
export async function swipeRow(page: Page, row: Locator) {
  // page.mouse は自動でスクロールしないので、先に行を画面の中央に出す。
  // 「画面内に入っていれば済み」の scrollIntoViewIfNeeded では、下端の行が固定のタブバーに隠れたまま
  // になり、タブバーをなぞってしまう（CI で一覧が長いときに起きた）
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await row.boundingBox()
  if (!box) throw new Error('行が表示されていません')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width - 140, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 290, y, { steps: 8 })
  await page.mouse.up()
}

/** 在庫の行を左にスワイプして「削除」を押す */
export async function swipeToDelete(page: Page, row: Locator) {
  await swipeRow(page, row)
  await row.getByRole('button', { name: '削除' }).click()
}

/** ブラウザからの Edge Function 呼び出しを、Node 上の処理本体（本物のテスト用 DB + モックの Claude）で処理する */
async function routeFunction(
  page: Page,
  name: string,
  handler: (req: Request) => Promise<Response>,
) {
  await page.route(`**/functions/v1/${name}`, async (route) => {
    const req = route.request()
    const res = await handler(
      new Request(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: req.method() === 'POST' ? req.postData() : undefined,
      }),
    )
    await route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    })
  })
}

/**
 * ブラウザからの提案リクエストを処理本体で処理する。
 * Edge Runtime（Deno）上での起動は CI の統合テスト（EDGE_FUNCTIONS=1）で確認している
 */
export const routeSuggestMeals = (page: Page) =>
  routeFunction(page, 'suggest-meals', nodeSuggestMealsHandler())

/** ブラウザからのレシート読み取りリクエストを処理本体で処理する */
export const routeReadReceipt = (page: Page) =>
  routeFunction(page, 'read-receipt', nodeReadReceiptHandler())
