import { expect, test, type Page } from '@playwright/test'
import { nodeSuggestMealsHandler } from '../support/suggestMeals'
import { loginAsNewMember } from './helpers'

/**
 * ブラウザからの提案リクエストを、Node 上の処理本体（本物のテスト用 DB + モックの Claude）で処理する。
 * Edge Runtime（Deno）上での起動は CI の統合テスト（EDGE_FUNCTIONS=1）で確認している
 */
async function routeSuggestMeals(page: Page) {
  const handler = nodeSuggestMealsHandler()
  await page.route('**/functions/v1/suggest-meals', async (route) => {
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

test('条件を指定して献立を提案してもらい、レシピを見られる', async ({ page }) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  const item = `鶏もも肉${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(item)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByRole('button', { name: '追加する' }).click()

  await page.getByRole('link', { name: '献立' }).click()
  // 長い食材名があっても画面が横にはみ出さない（iPhone で横スクロールが出ない）
  await page.getByRole('checkbox', { name: item }).waitFor()
  expect(
    // モバイルでは内容がはみ出すと innerWidth も広がるので、端末の画面幅と比べる
    await page.evaluate(() => document.documentElement.scrollWidth - window.screen.width),
  ).toBeLessThanOrEqual(0)
  await page.getByRole('radio', { name: '30 分' }).check()
  await page.getByLabel('気分・リクエスト').fill('和食')
  await page.getByRole('checkbox', { name: item }).check()
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()

  // 他のテストのメンバーが登録したアレルギーで一部の案が除かれることがあるので、件数ではなく案の中身で確認する
  const card = page.getByRole('article', { name: '鶏もも肉の照り焼き・キャベツの塩もみ' })
  await expect(card).toContainText('合計 25 分')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(recipe).toContainText('1 枚（300g）')
  await expect(recipe).toContainText('皮目から中火で 6 分焼く')
  await expect(recipe).toContainText('鶏肉を焼いている間にキャベツを塩もみしておく')
  await recipe.getByRole('button', { name: '閉じる' }).click()
  await expect(recipe).toHaveCount(0)
})
