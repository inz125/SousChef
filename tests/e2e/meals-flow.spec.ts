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

test('在庫の期限が近い食材の帯から、その食材を選んだ献立の質問に移れる。「×」でその日は出さない（D-76）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)
  const name = `鶏もも肉${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  // 期限を今日にする（日本時間）
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
  await page.getByLabel('期限', { exact: true }).fill(today)
  await page.getByRole('button', { name: '追加する' }).click()

  const band = page.getByRole('region', { name: '期限が近い食材' })
  await expect(band).toContainText('期限が近い食材が')
  await band.getByRole('button', { name: 'これで献立を考える' }).click()

  // 初めてなので 1 問目から。使いたい食材は帯の食材が選ばれている
  await expect(page.getByRole('heading', { name: '調理時間はどのくらい？' })).toBeVisible()
  await page.getByRole('radio', { name: '30 分', exact: true }).click()
  await page.getByRole('radio', { name: '在庫のみ', exact: true }).click()
  await page.getByRole('radio', { name: '炊いてある', exact: true }).click()
  await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked()

  await page.getByRole('link', { name: '在庫' }).click()
  await band.getByRole('button', { name: '閉じる' }).click()
  await expect(band).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('listitem', { name, exact: true })).toBeVisible()
  await expect(band).toHaveCount(0)
})
