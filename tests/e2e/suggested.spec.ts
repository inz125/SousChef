import { expect, test } from '@playwright/test'
import { loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

test('提案された料理は、作っていなくてもレシピタブの「最近提案された料理」に残る（D-51）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  // 長い表示名でも画面が横にはみ出さないことを確かめるため、わざと長くする
  const name = `提案者${Date.now()}-${'とても長い表示名'.repeat(4)}`
  await loginAsNewMember(page, name)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  await expect(page.getByRole('article').first()).toBeVisible()

  await page.getByRole('link', { name: 'レシピ' }).click()
  const list = page.getByRole('list', { name: '最近提案された料理' })
  // 1 世帯で共有するので、前のテストで提案された料理も並ぶ。最後に提案したのは自分
  const row = list.getByRole('listitem').filter({ hasText: 'キャベツの塩もみ' })
  await expect(row).toContainText(name)
  // はみ出すとレシピの★が押せなくなる
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.screen.width),
  ).toBeLessThanOrEqual(0)

  await row.getByRole('button', { name: 'キャベツの塩もみ', exact: true }).click()
  const recipe = page.getByRole('dialog', { name: 'キャベツの塩もみ' })
  await expect(recipe.getByRole('button', { name: 'キャベツの塩もみを保存' })).toBeVisible()
  await expect(recipe.getByRole('button', { name: '作った' })).toBeVisible()
})
