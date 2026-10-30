import { expect, test } from '@playwright/test'
import { mockRequests } from '../support/mockClaude'
import { FIRST, loginAsNewMember, routeSuggestMeals, suggestMeals } from './helpers'

test('提案されたレシピを料理ごとに AI で修正でき、開き直しても残り、元に戻せる（D-64）', async ({
  page,
}) => {
  await routeSuggestMeals(page)
  await loginAsNewMember(page)

  await page.getByRole('link', { name: '献立' }).click()
  await suggestMeals(page)
  await page
    .getByRole('article', { name: FIRST })
    .getByRole('button', { name: 'レシピを見る' })
    .click()
  const recipe = page.getByRole('dialog', { name: '鶏もも肉の照り焼き' })
  const main = recipe.getByRole('region', { name: '主菜 鶏もも肉の照り焼き' })
  await expect(main).toContainText('1 枚（300g）')

  await main.getByRole('button', { name: '鶏もも肉の照り焼きを修正' }).click()
  const instruction = `鶏肉を半分にして全体を調整して${Date.now()}`
  await main.getByRole('textbox', { name: 'どう直しますか？' }).fill(instruction)
  await main.getByRole('button', { name: '修正する' }).click()

  await expect(main).toContainText('1/2 枚（150g）')
  await expect(main).not.toContainText('1 枚（300g）')
  await expect(main.getByRole('textbox', { name: 'どう直しますか？' })).toHaveCount(0)
  // ほかの料理と段取りのコツはそのまま
  await expect(recipe.getByRole('region', { name: '副菜 キャベツの塩もみ' })).toContainText(
    '1/4 個',
  )
  await expect(recipe).toContainText('鶏肉を焼いている間にキャベツを塩もみしておく')
  const sent = (await mockRequests()).find((r) => JSON.stringify(r.messages).includes(instruction))
  expect(JSON.stringify(sent?.messages)).toContain('1 枚（300g）')

  // 開き直しても修正は残る（D-43）
  await page.reload()
  await page
    .getByRole('article', { name: FIRST })
    .getByRole('button', { name: 'レシピを見る' })
    .click()
  await expect(main).toContainText('1/2 枚（150g）')

  await main.getByRole('button', { name: '鶏もも肉の照り焼きを元に戻す' }).click()
  await expect(main).toContainText('1 枚（300g）')
  await expect(main.getByRole('button', { name: '鶏もも肉の照り焼きを元に戻す' })).toHaveCount(0)
})
