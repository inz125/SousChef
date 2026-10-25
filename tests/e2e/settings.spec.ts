import { expect, test } from '@playwright/test'
import { loginAsNewMember } from './helpers'

test('設定タブで自分の苦手・アレルギーと常備調味料を保存できる', async ({ page }) => {
  const name = `たろう${Date.now()}`
  await loginAsNewMember(page, name)

  await page.getByRole('link', { name: '設定' }).click()
  const me = page.getByRole('group', { name })
  await me.getByLabel('苦手な食材').fill('セロリ、パクチー')
  await me.getByLabel('アレルギー').fill('えび')
  await me.getByRole('button', { name: '保存する' }).click()
  await expect(me.getByText('保存しました')).toBeVisible()

  await expect(page.getByLabel('常備している調味料')).toHaveValue(/醤油/)

  await page.reload()
  await page.getByRole('link', { name: '設定' }).click()
  await expect(page.getByRole('group', { name }).getByLabel('苦手な食材')).toHaveValue(
    'セロリ、パクチー',
  )
  await expect(page.getByRole('group', { name }).getByLabel('アレルギー')).toHaveValue('えび')

  await page.getByRole('link', { name: '在庫' }).click()
  await expect(page.getByRole('tab', { name: 'すべて' })).toBeVisible()
})
