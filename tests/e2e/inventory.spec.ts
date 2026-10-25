import { expect, test } from '@playwright/test'
import { loginAsNewMember, swipeToDelete } from './helpers'

test('食材を追加し、量を切り替え、左スワイプで削除して元に戻せる', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `豚バラ肉${Date.now()}`

  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByLabel('保存場所').selectOption({ label: '冷蔵' })
  await expect(page.getByLabel('期限')).not.toHaveValue('')
  await page.getByRole('button', { name: '追加する' }).click()

  const row = page.getByRole('listitem').filter({ hasText: name })
  await expect(row).toContainText('目安')

  await row.getByRole('button', { name: 'ある' }).click()
  await expect(row.getByRole('button', { name: '少ない' })).toBeVisible()

  // 冷凍タブには出ない
  await page.getByRole('tab', { name: '冷凍' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
  await page.getByRole('tab', { name: '冷蔵' }).click()

  await swipeToDelete(page, row)
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible()

  // 再読み込みしても残っている（サーバに保存されている）
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('少ない')
})
