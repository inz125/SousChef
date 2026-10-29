import { expect, test } from '@playwright/test'
import { FIRST, loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

test('提案された料理を★で保存し、レシピタブで見て、保存をやめられる', async ({ page }) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  await page
    .getByRole('article', { name: FIRST })
    .getByRole('button', { name: 'レシピを見る' })
    .click()

  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  const star = recipe.getByRole('button', { name: '鶏もも肉の照り焼きを保存' })
  // 1 世帯で共有するので、前のテストで保存済みのこともある
  if ((await star.getAttribute('aria-pressed')) === 'true') await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await recipe.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('link', { name: 'レシピ' }).click()
  // 調理履歴のカレンダーにも同じ名前の料理が出ることがあるので、保存した料理の一覧の中で探す
  const savedList = page.getByRole('list', { name: '保存した料理' })
  await savedList.getByRole('button', { name: '鶏もも肉の照り焼き', exact: true }).click()
  const saved = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  await expect(saved).toContainText('皮目から中火で 6 分焼く')

  await saved.getByRole('button', { name: '鶏もも肉の照り焼きを保存' }).click()
  await saved.getByRole('button', { name: '閉じる' }).click()
  await expect(
    savedList.getByRole('button', { name: '鶏もも肉の照り焼き', exact: true }),
  ).toHaveCount(0)
})
