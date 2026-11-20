import { expect, test } from '@playwright/test'
import { deleteItem, loginAsNewMember, openItemMenu } from './helpers'

// 世帯で共有するデータなので、ほかのテストの品物と混ざらない一意な名前を使う
const uid = () => crypto.randomUUID().slice(0, 8)

test('常備食品を登録すると買い物リストに載り、チェックして消せる（D-71〜D-73）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const natto = `納豆${uid()}`

  await page.getByRole('link', { name: '設定' }).click()
  const stocked = page.getByRole('region', { name: '常備食品' })
  await stocked.getByLabel('常備食品を追加').fill(natto)
  await stocked.getByRole('button', { name: '追加' }).click()
  await expect(stocked.getByRole('listitem').filter({ hasText: natto })).toBeVisible()

  // 在庫にないので、すぐ買い物リストに載る
  await page.getByRole('link', { name: '在庫' }).click()
  await page.getByRole('tab', { name: /^買い物/ }).click()
  const list = page.getByRole('list', { name: '買い物リスト' })
  const row = list.getByRole('listitem', { name: natto })
  await expect(row).toBeVisible()

  await row.getByRole('checkbox', { name: natto }).click()
  await expect(row).toHaveAttribute('data-checked', 'true')
  await page.getByRole('button', { name: 'チェック済みを消す' }).click()
  await expect(row).toHaveCount(0)

  await page.getByRole('link', { name: '設定' }).click()
  await stocked.getByRole('button', { name: `${natto}を外す` }).click()
  await expect(stocked.getByRole('listitem').filter({ hasText: natto })).toHaveCount(0)
})

test('常備食品の在庫を削除すると載り、「元に戻す」で消える。常備でない食材は「買い物リストへ」で入れる（D-73・D-74）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const milk = `牛乳${uid()}`
  const cabbage = `キャベツ${uid()}`
  for (const [name, category] of [
    [milk, '乳製品'],
    [cabbage, '葉野菜'],
  ]) {
    await page.getByRole('button', { name: '食材を追加' }).click()
    await page.getByLabel('食材名').fill(name)
    await page.getByLabel('カテゴリ').selectOption({ label: category })
    await page.getByRole('button', { name: '追加する' }).click()
    await expect(page.getByRole('listitem', { name })).toBeVisible()
  }

  const menu = await openItemMenu(page, milk)
  await menu.getByRole('button', { name: '常備にする' }).click()
  await expect(page.getByRole('listitem', { name: milk })).toContainText('常')

  await deleteItem(page, milk)
  const toast = page.getByRole('status', { name: '元に戻す' })
  await expect(toast).toContainText(`${milk} を削除しました。買い物リストに入れました`)
  await page.getByRole('tab', { name: /^買い物/ }).click()
  const list = page.getByRole('list', { name: '買い物リスト' })
  await expect(list.getByRole('listitem', { name: milk })).toBeVisible()
  await toast.getByRole('button', { name: '元に戻す' }).click()
  await expect(list.getByRole('listitem', { name: milk })).toHaveCount(0)

  await page.getByRole('tab', { name: 'すべて' }).click()
  await deleteItem(page, cabbage)
  await toast.getByRole('button', { name: '買い物リストへ' }).click()
  await expect(toast).toContainText('買い物リストに入れました')
  await page.getByRole('tab', { name: /^買い物/ }).click()
  const row = list.getByRole('listitem', { name: cabbage })
  await expect(row).toBeVisible()

  // 後片付け（常備食品は世帯で共有するので、ほかのテストに残さない）
  await row.getByRole('checkbox', { name: cabbage }).click()
  await page.getByRole('button', { name: 'チェック済みを消す' }).click()
  await page.getByRole('tab', { name: 'すべて' }).click()
  const again = await openItemMenu(page, milk)
  await again.getByRole('button', { name: '常備から外す' }).click()
  await expect(page.getByRole('listitem', { name: milk })).not.toContainText('常')
})
