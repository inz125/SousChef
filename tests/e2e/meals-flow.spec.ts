import { expect, test } from '@playwright/test'
import { FIRST, loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

test('提案結果の下のボタンで条件を変え、確認画面の行から答え直して提案できる（D-77・D-78）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)
  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page, { minutes: '30 分' })

  // カードのどこをタップしてもレシピが開く（D-78）
  const card = page.getByRole('article', { name: FIRST })
  await card.getByText(/^＋ /).first().click()
  const recipe = page.getByRole('dialog').first()
  await expect(recipe).toBeVisible()
  await recipe.getByRole('button', { name: '閉じる' }).click()

  // 3 案の下に 2 つのボタンが並ぶ
  const actions = page.getByRole('group', { name: '次の提案' })
  await expect(actions.getByRole('button')).toHaveText(['条件を変えて提案', '同じ条件で別の案'])
  const left = (await actions.getByRole('button').nth(0).boundingBox())!
  const right = (await actions.getByRole('button').nth(1).boundingBox())!
  expect(left.y).toBe(right.y)
  expect(left.x).toBeLessThan(right.x)

  // 条件を変えるときは確認画面から始め、行から開いた質問に答えると確認画面に戻る（D-77）
  await actions.getByRole('button', { name: '条件を変えて提案' }).click()
  await expect(page.getByRole('heading', { name: 'この条件で提案します' })).toBeVisible()
  await expect(page.getByRole('button', { name: '戻る' })).toHaveCount(0)
  await page.getByRole('button', { name: /^調理時間/ }).click()
  await page.getByRole('radio', { name: '15 分', exact: true }).click()
  await expect(page.getByRole('button', { name: /^調理時間/ })).toContainText('15 分')
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()
  await expect(card).toBeVisible()
})
