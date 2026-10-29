import { expect, test } from '@playwright/test'
import { deleteItem, loginAsNewMember, openItemMenu } from './helpers'

test('食材を追加し、長押しメニューで量を切り替え、削除して元に戻せる', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `豚バラ肉${Date.now()}`

  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByLabel('保存場所').selectOption({ label: '冷蔵' })
  await expect(page.getByLabel('期限')).not.toHaveValue('')
  await page.getByRole('button', { name: '追加する' }).click()

  const tile = page.getByRole('listitem', { name, exact: true })
  await expect(tile).toContainText('目安')

  // 量は長押しメニューで切り替え、「少ない」のときだけ印が出る（D-41・D-56）
  await expect(tile).not.toContainText('少ない')
  await (await openItemMenu(page, name)).getByRole('button', { name: '少ないにする' }).click()
  await expect(tile).toContainText('少ない')

  // 冷凍タブには出ない
  await page.getByRole('tab', { name: '冷凍' }).click()
  await expect(tile).toHaveCount(0)
  await page.getByRole('tab', { name: '冷蔵' }).click()

  await deleteItem(page, name)
  await expect(tile).toHaveCount(0)
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(tile).toBeVisible()

  // 再読み込みしても残っている（サーバに保存されている）
  await page.reload()
  await expect(page.getByRole('listitem', { name, exact: true })).toContainText('少ない')
})

test('食材のイラストを出し、イラストのない食材は「作成中」にして設定画面に並べる（D-56）', async ({
  page,
}) => {
  await loginAsNewMember(page)
  const pending = `ズッキーニ${Date.now()}`
  for (const [name, category] of [
    ['たまご', '卵'],
    [pending, '根菜・いも'],
  ]) {
    await page.getByRole('button', { name: '食材を追加' }).click()
    await page.getByLabel('食材名').fill(name)
    await page.getByLabel('カテゴリ').selectOption({ label: category })
    await page.getByRole('button', { name: '追加する' }).click()
  }

  // 他のテストの「たまご」が残っていることもあるので先頭で確かめる
  const egg = page.getByRole('listitem', { name: 'たまご', exact: true }).first()
  await expect(egg.locator('img')).toBeVisible()
  await expect(egg).not.toContainText('作成中')
  const zucchini = page.getByRole('listitem', { name: pending, exact: true })
  await expect(zucchini).toContainText('作成中')
  await expect(zucchini.locator('img')).toHaveCount(0)

  await page.getByRole('link', { name: '設定' }).click()
  const waiting = page.getByRole('region', { name: 'イラスト待ち' })
  await expect(waiting.getByRole('listitem').filter({ hasText: pending })).toBeVisible()
  await expect(waiting.getByRole('listitem').filter({ hasText: 'たまご' })).toHaveCount(0)
})
