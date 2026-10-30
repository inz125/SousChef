import { expect, type Page } from '@playwright/test'
import { nodeMakeRecipeHandler } from '../support/makeRecipe'
import { nodeReadReceiptHandler } from '../support/readReceipt'
import { nodeReviseDishHandler } from '../support/reviseDish'
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

/** 食材を長押しして、メニュー（量の切り替え・解凍・削除）を開く（D-56） */
export async function openItemMenu(page: Page, name: string) {
  const tile = page.getByRole('button', { name, exact: true })
  // page.mouse は自動でスクロールしないので、先に食材を画面の中央に出す（下端だと固定のタブバーに隠れる）
  await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await tile.boundingBox()
  if (!box) throw new Error('食材が表示されていません')
  await page.mouse.move(box.x + box.width / 2, box.y + 20)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  const menu = page.getByRole('dialog', { name: `${name}の操作` })
  await expect(menu).toBeVisible()
  return menu
}

/** 食材を長押しメニューの「削除」で消す */
export async function deleteItem(page: Page, name: string) {
  const menu = await openItemMenu(page, name)
  await menu.getByRole('button', { name: '削除' }).click()
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
 * ブラウザからの提案リクエスト（案とレシピ, D-63。料理の修正, D-64）を処理本体で処理する。
 * Edge Runtime（Deno）上での起動は CI の統合テスト（EDGE_FUNCTIONS=1）で確認している
 */
export async function routeSuggestMeals(page: Page) {
  await routeFunction(page, 'suggest-meals', nodeSuggestMealsHandler())
  await routeFunction(page, 'make-recipe', nodeMakeRecipeHandler())
  await routeFunction(page, 'revise-dish', nodeReviseDishHandler())
}

/** ブラウザからのレシート読み取りリクエストを処理本体で処理する */
export const routeReadReceipt = (page: Page) =>
  routeFunction(page, 'read-receipt', nodeReadReceiptHandler())

export type MealAnswers = {
  minutes?: string
  shopping?: string
  /** ご飯（D-54）。「炊いてない」なら麺を noodle で選ぶ */
  rice?: string
  noodle?: string
  mustUse?: string[]
  soup?: string
  /** 麺を選んだときの「副菜: あり / なし」（D-54） */
  sideDish?: string
  side?: string
  mood?: string
}

/** 選択式の質問に答える。指定しなければ選ばれている答えのまま進む（D-53） */
async function choose(page: Page, question: string, name?: string) {
  await expect(page.getByRole('heading', { name: question })).toBeVisible()
  const radio = name
    ? page.getByRole('radio', { name, exact: true })
    : page.getByRole('radio', { checked: true })
  await radio.click()
}

/** 献立のインタビューに答えて確認まで進む（D-53） */
export async function answerMealInterview(page: Page, a: MealAnswers = {}) {
  await choose(page, '調理時間はどのくらい？', a.minutes)
  await choose(page, '食材を買い足してもいい？', a.shopping)
  await choose(page, 'ご飯は炊いてある？', a.rice)
  if (a.noodle) await choose(page, '主食の麺はどれにする？', a.noodle)
  // 1 世帯で共有する在庫が空のときは「使いたい食材」を飛ばす
  const mustUse = page.getByRole('heading', { name: '使いたい食材はある？' })
  await expect(mustUse.or(page.getByRole('heading', { name: '汁物はつける？' }))).toBeVisible()
  if (await mustUse.isVisible()) {
    for (const name of a.mustUse ?? []) {
      await page.getByRole('checkbox', { name, exact: true }).check()
    }
    await page.getByRole('button', { name: '次へ' }).click()
  }
  await choose(page, '汁物はつける？', a.soup)
  if (a.noodle) await choose(page, '副菜はつける？', a.sideDish)
  if (a.sideDish !== 'なし') await choose(page, '副菜はレンジで作る？', a.side)
  await expect(page.getByRole('heading', { name: '気分やリクエストはある？' })).toBeVisible()
  if (a.mood) await page.getByRole('textbox', { name: '気分やリクエストはある？' }).fill(a.mood)
  await page.getByRole('button', { name: '次へ' }).click()
  await expect(page.getByRole('heading', { name: 'この条件で提案します' })).toBeVisible()
}

/** 献立のインタビューに答えて提案してもらい、案のレシピができるまで待つ（D-63） */
export async function suggestMeals(page: Page, a: MealAnswers = {}) {
  await answerMealInterview(page, a)
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()
  await waitForRecipes(page)
}

/** 案が出て、すべての案のレシピができるまで待つ（D-63）。途中で開き直すとレシピは作り直しになる */
export async function waitForRecipes(page: Page) {
  await expect(page.getByRole('article').first()).toBeVisible()
  await expect(page.getByText('レシピを作っています…')).toHaveCount(0)
}
