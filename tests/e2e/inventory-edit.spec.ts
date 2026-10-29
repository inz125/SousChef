import { expect, test } from '@playwright/test'
import { loginAsNewMember } from './helpers'

test('行をタップして詳細を編集でき、場所を変えると目安の期限が再推定される', async ({ page }) => {
  await loginAsNewMember(page)
  const name = `鶏もも肉${Date.now()}`
  await page.getByRole('button', { name: '食材を追加' }).click()
  await page.getByLabel('食材名').fill(name)
  await page.getByLabel('カテゴリ').selectOption({ label: '肉' })
  await page.getByLabel('保存場所').selectOption({ label: '冷蔵' })
  await page.getByRole('button', { name: '追加する' }).click()

  await page.getByRole('button', { name, exact: true }).click()
  const fridgeExpiry = await page.getByLabel('期限').inputValue()
  await page.getByLabel('保存場所').selectOption({ label: '冷凍' })
  await expect(page.getByLabel('期限')).not.toHaveValue(fridgeExpiry)
  await page.getByLabel('食材名').fill(`${name}（下味）`)
  await page.getByRole('button', { name: '保存する' }).click()

  await page.getByRole('tab', { name: '冷凍' }).click()
  await expect(page.getByRole('listitem', { name: `${name}（下味）` })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: '冷凍' }).click()
  await expect(page.getByRole('listitem', { name: `${name}（下味）` })).toContainText('目安')
})
