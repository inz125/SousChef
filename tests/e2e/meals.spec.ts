import { expect, test } from '@playwright/test'
import { FIRST, loginAsNewMember, routeSuggestMeals } from './helpers'

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
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toContainText('合計 25 分')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(recipe).toContainText('1 枚（300g）')
  await expect(recipe).toContainText('皮目から中火で 6 分焼く')
  await expect(recipe).toContainText('鶏肉を焼いている間にキャベツを塩もみしておく')
  await expect(recipe.getByRole('region', { name: '汁物 豆腐とねぎの味噌汁' })).toBeVisible()
  await recipe.getByRole('button', { name: '閉じる' }).click()
  await expect(recipe).toHaveCount(0)
})

test('提案した献立は、タブを移っても開き直しても次の提案まで残り、「作った」を押せる（D-43）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await page.getByRole('radio', { name: '15 分' }).check()
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()
  const card = page.getByRole('article', { name: FIRST })
  await expect(card).toBeVisible()

  await page.getByRole('link', { name: '在庫' }).click()
  await page.getByRole('link', { name: 'レシピ' }).click()
  await page.getByRole('link', { name: '献立' }).click()
  await expect(card).toBeVisible()

  await page.reload()
  await expect(card).toBeVisible()
  await expect(page.getByRole('radio', { name: '15 分' })).toBeChecked()
  await card.getByRole('button', { name: 'レシピを見る' }).click()
  await page.getByRole('button', { name: '作った' }).click()
  await expect(page.getByRole('dialog', { name: '使った食材' })).toBeVisible()
})
