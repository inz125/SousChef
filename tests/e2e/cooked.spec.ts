import { expect, test, type Locator, type Page } from '@playwright/test'
import { FIRST, loginAsNewMember, routeSuggestMeals } from './helpers'

/**
 * 1 世帯で共有するテスト用 DB には同名の食材が他にもあることがあるので、使った在庫を選ぶ。
 * 候補が 1 つなら選ぶ欄は出ない
 */
async function pickStock(group: Locator, name: string) {
  // 在庫の読み込みが終わってから選ぶ欄の有無を判断する（先に数えると欄がないと誤判定する）
  await expect(group).toBeVisible()
  const select = group.getByLabel('使った在庫')
  if (await select.count()) await select.selectOption({ label: name })
}

async function addItem(page: Page, name: string, category: string) {
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: category })
  await page.getByLabel('保存場所').selectOption({ label: '冷蔵' })
  await page.getByRole('button', { name: '追加する' }).click()
  await expect(page.getByRole('listitem', { name })).toBeVisible()
}

test('「作った」で使った食材の在庫を更新し、余った買い足し食材を追加し、履歴に残る', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page, 'はな')
  const ts = Date.now()
  const chicken = `鶏もも肉${ts}`
  const cabbage = `キャベツ${ts}`
  await addItem(page, chicken, '肉')
  await addItem(page, cabbage, '葉野菜')

  await page.getByRole('link', { name: '献立' }).click()
  await page.getByRole('button', { name: '献立を提案してもらう' }).click()
  await page
    .getByRole('article', { name: FIRST })
    .getByRole('button', { name: 'レシピを見る' })
    .click()
  await page.getByRole('button', { name: '作った' }).click()

  const sheet = page.getByRole('dialog', { name: '使った食材' })
  const chickenGroup = sheet.getByRole('group', { name: '鶏もも肉' })
  await pickStock(chickenGroup, chicken)
  await chickenGroup.getByRole('radio', { name: '使い切った' }).check()
  const cabbageGroup = sheet.getByRole('group', { name: 'キャベツ' })
  await pickStock(cabbageGroup, cabbage)
  await cabbageGroup.getByRole('radio', { name: '少ない' }).check()
  await sheet.getByRole('checkbox', { name: 'しょうがが余った' }).check()
  await sheet.getByRole('button', { name: '在庫を更新して記録する' }).click()
  await expect(sheet).toHaveCount(0)

  await page.getByRole('link', { name: '在庫' }).click()
  await expect(page.getByRole('listitem', { name: cabbage })).toBeVisible()
  await expect(page.getByRole('listitem', { name: chicken })).toHaveCount(0)
  await expect(page.getByRole('listitem', { name: cabbage })).toContainText('少ない')
  await expect(page.getByRole('listitem', { name: 'しょうが' }).first()).toBeVisible()

  await page.getByRole('link', { name: 'レシピ' }).click()
  // カレンダーは今日が選ばれていて、今日の記録が出る（D-45）
  const today = page.getByRole('list', { name: /の記録$/ })
  await expect(today).toContainText('鶏もも肉の照り焼き・キャベツの塩もみ・豆腐とねぎの味噌汁')
  await expect(today).toContainText('はな')
  await today.getByRole('button', { name: '豆腐とねぎの味噌汁' }).first().click()
  await expect(page.getByRole('dialog', { name: '豆腐とねぎの味噌汁' })).toContainText(
    '湯を沸かしてだしを入れる',
  )
})
