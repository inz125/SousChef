import { expect, test } from '@playwright/test'
import { loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

/** モックの献立の 3 案目。豆腐（在庫の印）を使う。テストでは豆腐を在庫に登録しない */
const THIRD = '豆腐ステーキ・トマトのサラダ・キャベツの味噌汁'

test('在庫の印の材料が今の在庫になければ、買い足しとして扱う（D-69）', async ({ page }) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)
  // キャベツ（在庫の印）は在庫にある状態にする。名前の一部が一致すれば在庫のまま
  const cabbage = `キャベツ${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(cabbage)
  await page.getByLabel('カテゴリ').selectOption({ label: '葉野菜' })
  await page.getByRole('button', { name: '追加する' }).click()
  await expect(page.getByRole('listitem', { name: cabbage })).toBeVisible()

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  const card = page.getByRole('article', { name: THIRD })
  // 買い足し: トマト（もとから）＋ 豆腐（在庫にない）
  await expect(card).toContainText('買い足し 2 品')

  await card.getByRole('button', { name: 'レシピを見る' }).click()
  const recipe = page.getByRole('dialog', { name: '豆腐ステーキ' })
  // 手順の行と区別するため、材料の行（名前・分量・印）で確かめる
  await expect(recipe.getByText('豆腐1 丁買い足し')).toBeVisible()
  await expect(recipe.getByText('キャベツ1/8 個在庫')).toBeVisible()

  await page.getByRole('button', { name: '作った' }).click()
  const sheet = page.getByRole('dialog', { name: '使った食材' })
  await expect(sheet.getByRole('group', { name: 'キャベツ' })).toBeVisible()
  await expect(sheet.getByText('豆腐 は在庫にありません')).toHaveCount(0)
  await expect(sheet.getByRole('checkbox', { name: '豆腐が余った' })).toBeVisible()
  // 記録すると豆腐が在庫に入り、ほかのテストに影響するので、記録はコンポーネントテストで確かめる
  await sheet.getByRole('button', { name: 'キャンセル' }).click()
})
